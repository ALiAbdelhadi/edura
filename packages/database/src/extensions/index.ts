import { getRequestContext } from "../context";
import { Prisma } from "../generated/client/index";

const SOFT_DELETE_MODELS = new Set<string>(["User"]);

const IMMUTABLE_MODELS = new Set<string>([
  "Transaction",
  "PointsLedger",
  "WalletLedger",
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
