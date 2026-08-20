import { withPlatformContext } from "@repo/database";
import { headers as nextHeaders } from "next/headers";
import { auth } from "./auth";

/**
 * IS A SUPER ADMIN BEHIND THIS SESSION?
 *
 * Answered from `auth_sessions.impersonated_by` — a DATABASE fact, never a
 * cookie, a header or a client flag. That matters more than it looks: the
 * banner this feeds is the only thing telling whoever is at the keyboard that
 * the money they are about to move will be recorded against a real centre, and
 * a banner that can be suppressed from the client is not a safeguard.
 *
 * Returns null for an ordinary session, which is the overwhelmingly common
 * case, and never throws — outside a request scope (the db proof suites call
 * route handlers directly) there is no session to read and the honest answer is
 * "not a view-as".
 */
export type ViewAsContext = {
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  expiresAt: Date | null;
};

export async function getViewAsContext(): Promise<ViewAsContext | null> {
  let impersonatedBy: string | null | undefined;
  let expiresAt: Date | null = null;
  try {
    const res = await auth.api.getSession({ headers: await nextHeaders() });
    const session = res?.session as
      | { impersonatedBy?: string | null; expiresAt?: Date | string | null }
      | undefined;
    impersonatedBy = session?.impersonatedBy;
    expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
  } catch {
    return null;
  }
  if (!impersonatedBy) return null;

  const actor = await withPlatformContext((tx) =>
    tx.user.findUnique({
      where: { id: impersonatedBy },
      select: { id: true, name: true, email: true },
    }),
  ).catch(() => null);

  return {
    actorId: impersonatedBy,
    actorName: actor?.name ?? null,
    actorEmail: actor?.email ?? null,
    expiresAt,
  };
}

/**
 * Where the "back to the back office" button goes.
 *
 * `SUPERADMIN_BASE_URL` is its own knob rather than a reuse of `APP_BASE_URL`
 * (which is the ERP's own public origin) — the two apps deploy as separate
 * Vercel projects sharing one `.env.production`, so a single variable cannot
 * mean both hosts. Falls back to localhost in development only.
 */
export function superadminBaseUrl(): string {
  const base = process.env.SUPERADMIN_BASE_URL || "http://localhost:3004";
  return base.replace(/\/+$/, "");
}
