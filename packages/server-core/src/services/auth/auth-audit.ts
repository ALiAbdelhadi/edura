import { platformDb } from "../../db/scope";

/**
 * SECURITY_AUDIT.md (2026-09-11) OPS-03. The ERP audited money, exports and
 * identity changes but not the door itself: a failed login, a password reset,
 * a second factor switched on or off left no row. These are the events an
 * investigation starts from, so each writes one `audit_logs` row on its own
 * short transaction (never inside the auth request's, which may be rolling
 * back for exactly the reason being recorded).
 *
 * Failures here are reported, never thrown: an audit that cannot be written
 * must not turn a correct refusal into a 500.
 */
export type AuthAuditAction =
  | "auth.login_failed"
  | "auth.login_succeeded"
  | "auth.password_reset"
  | "auth.password_changed"
  | "auth.two_factor_enabled"
  | "auth.two_factor_disabled";

export async function recordAuthEvent(
  action: AuthAuditAction,
  opts: { userId: string | null; ipAddress?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await platformDb((tx) =>
      tx.auditLog.create({
        data: {
          actorId: opts.userId,
          action,
          targetType: "user",
          targetId: opts.userId,
          centerId: null,
          ...(opts.ipAddress ? { ipAddress: opts.ipAddress } : {}),
          afterState: (opts.meta ?? undefined) as never,
        },
      }),
    );
  } catch (err) {
    console.error(`[auth-audit] '${action}' row was NOT written:`, err instanceof Error ? err.message : err);
  }
}
