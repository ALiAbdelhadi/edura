import { withPlatformContext } from "@repo/database";
import { readAuthSession } from "./read-session";

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
    // Shares the request's single session read with `getSessionUser` — the
    // portal chrome renders this banner on every page, so a second read here
    // doubled the session queries of every render.
    const res = await readAuthSession();
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

export function superadminBaseUrl(): string {
  const base = process.env.SUPERADMIN_BASE_URL || "http://localhost:3004";
  return base.replace(/\/+$/, "");
}
