import { getRequestContext } from "../context";
import { Prisma } from "../generated/client/index";

const SOFT_DELETE_MODELS = new Set<string>(["User"]);

const IMMUTABLE_MODELS = new Set<string>([
  "Transaction",
  "PointsLedger",
  "WalletLedger",
  "ParentWalletLedger",
  "SessionSettlement",
]);

const NO_HARD_DELETE_MODELS = new Set<string>(["Invoice", "Payout"]);

const AUDITED: Record<string, string> = {
  "Center.update": "center.updated",
  "TeacherProfile.update": "teacher.updated",
  "BlacklistEntry.create": "blacklist.added",
  "BlacklistEntry.update": "blacklist.changed",
  "PointsLedger.create": "points.adjusted",
  "PointsRule.create": "points_rule.created",
  "PointsRule.update": "points_rule.updated",
  "PointsRule.delete": "points_rule.deleted",
  "Payout.update": "payout.decided",
  "CenterAdminProfile.create": "permission.granted",
  "CenterAdminProfile.delete": "permission.revoked",
  // Money policy: a change to the wallet top-up bounds affects every student's
  // ability to put money in, so the back-office write is auditable. Safe to do
  // model-level here because wallet_settings has exactly ONE writer.
  //
  // CommissionSetting is deliberately NOT listed: rooms-split.ts already writes
  // its own before/after audit rows for the split + Method-2 rate edits of that
  // same table (revenue_split.*, m2_rate.*), and commission-admin.ts does the
  // same for the global rates — a model-level entry here would DOUBLE-log every
  // one of them.
  "WalletSettings.create": "wallet_settings.updated",
  "WalletSettings.update": "wallet_settings.updated",
};

void SOFT_DELETE_MODELS;

// ---------------------------------------------------------------------------
// C-03 — deactivation must revoke LIVE sessions, not just block the next login.
//
// Sessions are 30-day JWTs, so a suspend / blacklist / soft-delete that only
// writes `users.status` leaves the account fully authenticated (writes included)
// until the token expires. Instead of a parallel session store, a deactivating
// write rides the SAME L1 epoch a password reset already uses:
// `token_version += 1`, folded into the caller's OWN update statement so it
// commits atomically with the status change inside their transaction.
//
// It lives here rather than at each call site precisely because there are many
// of them (updateUserStatus, platformBlacklistUser, rejectTeacher, rejectCenter
// / blacklistCenter / toggleCenter cascading to center admins, the deletion-
// request approver, temp-student shell cleanup) and a future one must not be
// able to forget it.
//
// Reactivation (`status: "active"`) deliberately does NOT bump: there is no
// session to revoke, and a reinstated user logs in fresh against the current
// epoch. A caller already managing the epoch itself (resetPassword) wins.
//
// This bump is defence in depth and the auditable record in the row; the
// authoritative gate is the per-request live-status re-read in BOTH apps'
// NextAuth `jwt` callback (see apps/*/src/lib/auth/options.ts), which also
// catches status changes made outside Prisma entirely.
// ---------------------------------------------------------------------------
const SESSION_VALID_STATUS = "active";

// Prisma accepts both `status: "x"` and `status: { set: "x" }`.
function unwrapSet(value: unknown): unknown {
  if (value && typeof value === "object" && "set" in (value as object)) {
    return (value as { set: unknown }).set;
  }
  return value;
}

function deactivates(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if ("status" in d) {
    const status = unwrapSet(d.status);
    if (typeof status === "string" && status !== SESSION_VALID_STATUS) return true;
  }
  if ("deletedAt" in d && unwrapSet(d.deletedAt) != null) return true;
  return false;
}

function withSessionRevocation(args: unknown): unknown {
  const a = (args ?? {}) as { data?: unknown };
  if (!deactivates(a.data)) return a;
  const d = a.data as Record<string, unknown>;
  if ("tokenVersion" in d) return a; // caller owns the epoch — never double-bump
  return { ...a, data: { ...d, tokenVersion: { increment: 1 } } };
}

export const sessionRevocationExtension = Prisma.defineExtension({
  name: "edura-session-revocation",
  query: {
    user: {
      async update({ args, query }) {
        return query(withSessionRevocation(args) as never);
      },
      async updateMany({ args, query }) {
        return query(withSessionRevocation(args) as never);
      },
    },
  },
});

export const softDeleteExtension = Prisma.defineExtension((client) => {
  const c = client as unknown as {
    user: {
      update: (a: unknown) => Promise<unknown>;
      updateMany: (a: unknown) => Promise<unknown>;
    };
  };
  const withNotDeleted = (
    args: { where?: Record<string, unknown> } | undefined,
  ) => {
    const a = (args ?? {}) as { where?: Record<string, unknown> };
    a.where = { deletedAt: null, ...(a.where ?? {}) };
    return a;
  };
  return client.$extends({
    name: "edura-soft-delete",
    query: {
      user: {
        async delete({ args }) {
          return c.user.update({
            where: (args as { where: unknown }).where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ args }) {
          return c.user.updateMany({
            where: (args as { where?: unknown }).where ?? {},
            data: { deletedAt: new Date() },
          });
        },
        async findMany({ args, query }) {
          return query(withNotDeleted(args) as never);
        },
        async findFirst({ args, query }) {
          return query(withNotDeleted(args) as never);
        },
        async count({ args, query }) {
          return query(withNotDeleted(args) as never);
        },
      },
    },
  });
});

export const immutableExtension = Prisma.defineExtension({
  name: "edura-immutable-ledgers",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (
          model &&
          IMMUTABLE_MODELS.has(model) &&
          (operation === "update" ||
            operation === "updateMany" ||
            operation === "delete" ||
            operation === "deleteMany" ||
            operation === "upsert")
        ) {
          throw new Error(
            `${model} is append-only (PRD Database Conventions). Use a reversal-entry insert instead of ${operation}.`,
          );
        }
        if (
          model &&
          NO_HARD_DELETE_MODELS.has(model) &&
          (operation === "delete" || operation === "deleteMany")
        ) {
          throw new Error(
            `${model} must not be hard-deleted (financial record). Void/reject it via a status update instead.`,
          );
        }
        return query(args);
      },
    },
  },
});

export const auditLogExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "edura-audit-log",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          const key = `${model}.${operation}`;
          const action = model ? AUDITED[key] : undefined;
          if (action && model) {
            const ctx = getRequestContext();
            const rec = result as { id?: string } | null;
            try {
              const c = client as {
                $transaction: (
                  fn: (tx: {
                    $executeRaw: (
                      q: TemplateStringsArray,
                      ...v: unknown[]
                    ) => Promise<unknown>;
                    auditLog: { create: (a: unknown) => Promise<unknown> };
                  }) => Promise<unknown>,
                ) => Promise<unknown>;
              };
              await c.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
                await tx.auditLog.create({
                  data: {
                    actorId: ctx?.actorId ?? null,
                    action,
                    targetType: model.toLowerCase(),
                    targetId: rec?.id ?? null,
                    centerId: ctx?.centerId ?? null,
                    afterState: (result as object) ?? undefined,
                    ipAddress: ctx?.ipAddress ?? null,
                  },
                });
              });
            } catch {
              // Audit must never break the primary mutation; swallow + log upstream.
            }
          }
          return result;
        },
      },
    },
  }),
);

// =============================================================================
// ROLE GUARD — refuse to serve on a connection that can see through RLS
// =============================================================================
// WHY THIS EXISTS — the failure it prevents, found 2026-07-26:
//
// `apps/www/.env.production` and `apps/superadmin/.env.production` set
// DATABASE_URL to the database OWNER (`neondb_owner`, which carries the
// BYPASSRLS role attribute). On that connection:
//
//   * all 56 RLS policies across 35 tables are INERT — tenant isolation is off;
//   * every money REVOKE is INERT — `transactions`, `points_ledger`,
//     `session_settlements` and `audit_logs` become freely UPDATE/DELETE-able.
//
// The migrations had already anticipated owner-exemption: all 35 RLS tables
// carry FORCE ROW LEVEL SECURITY, which exists precisely to subject a table's
// owner to its own policies. It is defeated only because the BYPASSRLS *role
// attribute* always wins over FORCE. So the schema was right and the connection
// string undid it — and nothing reported an error, because every proof runs in
// dev, where DATABASE_URL is correctly `edura_app`.
//
// A checklist cannot prevent that: the failure mode IS a copied or
// hand-edited connection string. So, in the same spirit as db-guard, the
// property is asserted against the LIVE CONNECTION rather than trusted from
// config.
//
// THREE DESIGN CHOICES, each load-bearing:
//
//  1. It asserts the CAPABILITY, not the role name. `current_user <>
//     'neondb_owner'` would be defeated by a rename or a second
//     owner-equivalent role; `rolsuper OR rolbypassrls` is the property that
//     actually matters — "can this connection see through RLS?".
//  2. It FAILS CLOSED IN EVERY ENVIRONMENT, not just production. A dev process
//     silently running as owner disables the isolation the test suite exists to
//     prove, which is exactly how this survived unnoticed.
//  3. ONE call site. It is the OUTERMOST extension on the client every app
//     query funnels through, so it cannot be forgotten by a new route. The
//     three legitimately-owner entry points (`prisma migrate deploy`,
//     `bootstrap-app-role.ts`, `test-cleanup.ts`) open their own pg pools on
//     ADMIN_URL/DIRECT_URL and never touch this client, so they bypass the
//     guard BY CONSTRUCTION rather than by exception.
//
// Cost: one `SELECT` per process, memoised. The rejection is cached too, so a
// retry cannot slip past a first failure.
// =============================================================================

type RoleCheck = { usr: string; unsafe: boolean };

let roleCheck: Promise<RoleCheck> | undefined;

/** Reset between tests. Not for application use. */
export function __resetRoleGuard(): void {
  roleCheck = undefined;
}

async function assertSafeRole(client: {
  $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
}): Promise<RoleCheck> {
  roleCheck ??= (async () => {
    const rows = (await client.$queryRaw`
      SELECT current_user::text AS usr,
             COALESCE(
               (SELECT r.rolsuper OR r.rolbypassrls
                  FROM pg_roles r WHERE r.rolname = current_user),
               false
             ) AS unsafe`) as RoleCheck[];
    const row = rows[0];
    if (!row) {
      throw new Error(
        "role-guard: could not determine the current database role. Refusing to serve.",
      );
    }
    if (row.unsafe) {
      throw new Error(
        `role-guard: REFUSING TO SERVE as database role "${row.usr}".\n` +
          `  This role is SUPERUSER or has BYPASSRLS, so:\n` +
          `    - every RLS policy is inert (tenant isolation is OFF), and\n` +
          `    - the append-only REVOKEs on transactions / points_ledger /\n` +
          `      session_settlements / audit_logs do not apply.\n` +
          `  Point DATABASE_URL at the unprivileged application role (edura_app,\n` +
          `  NOBYPASSRLS). Migrations and bootstrap keep using DIRECT_URL /\n` +
          `  ADMIN_URL — those must never appear in a serving environment.\n` +
          `  See docs/reports/feature-completeness.md "FINDING 0".`,
      );
    }
    return row;
  })();
  return roleCheck;
}

export const roleGuardExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "edura-role-guard",
    query: {
      async $allOperations({ args, query }) {
        await assertSafeRole(
          client as unknown as Parameters<typeof assertSafeRole>[0],
        );
        return query(args);
      },
    },
  }),
);
