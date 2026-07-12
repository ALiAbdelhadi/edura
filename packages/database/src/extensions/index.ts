import { getRequestContext } from "../context";
import { Prisma } from "../generated/client/index";

// ---------------------------------------------------------------------------
// Model policy sets
// ---------------------------------------------------------------------------

/** Models carrying a `deletedAt` column — delete() becomes a soft delete and
 *  reads auto-filter out soft-deleted rows. */
const SOFT_DELETE_MODELS = new Set<string>(["User"]);

/** Strict append-only ledgers: NO update/delete/upsert — corrections happen via
 *  reversal-entry inserts only (PRD Database Conventions). */
const IMMUTABLE_MODELS = new Set<string>(["Transaction", "PointsLedger"]);

/** Financial workflow records: status legitimately transitions (invoice
 *  issued→paid→void; payout pending→approved→paid), but they must NEVER be
 *  hard-deleted (void/reject instead). Updates allowed, deletes blocked. */
const NO_HARD_DELETE_MODELS = new Set<string>(["Invoice", "Payout"]);

/** Sensitive mutations that must always be audited, keyed by `Model.action`.
 *  Maps to the audit_logs.action string. */
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

// Note: SOFT_DELETE_MODELS documents intent; the query overrides below are
// declared per-model (Prisma requires concrete model keys to re-dispatch a
// delete as an update). Currently only `user` carries deletedAt.
void SOFT_DELETE_MODELS;

// ---------------------------------------------------------------------------
// Soft-delete extension: converts delete → update(deletedAt), filters reads.
// Uses the client-factory form so it can re-dispatch delete → update.
// ---------------------------------------------------------------------------
export const softDeleteExtension = Prisma.defineExtension((client) => {
  const c = client as unknown as {
    user: {
      update: (a: unknown) => Promise<unknown>;
      updateMany: (a: unknown) => Promise<unknown>;
    };
  };
  const withNotDeleted = (args: { where?: Record<string, unknown> } | undefined) => {
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

// ---------------------------------------------------------------------------
// Immutability guard: block mutations on append-only ledgers.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Audit-log extension: auto-write audit_logs on sensitive mutations, attributing
// the actor from the ambient request context. Runs AFTER the mutation succeeds.
// ---------------------------------------------------------------------------
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
              // Audit writes happen outside the request's tenant transaction, so
              // set the RLS bypass flag for this insert (audit_logs is RLS-read-
              // scoped per tenant but must always be writable).
              const c = client as {
                $transaction: (fn: (tx: {
                  $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
                  auditLog: { create: (a: unknown) => Promise<unknown> };
                }) => Promise<unknown>) => Promise<unknown>;
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
