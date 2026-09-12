import type { Role } from "@repo/database";
import { withPlatformContext } from "@repo/database";

export type LoginApp = "www" | "superadmin";

const LOGIN_APP: Record<Role, LoginApp> = {
  super_admin: "superadmin",
  accountant: "superadmin",

  center_admin: "www",
  center_staff: "www",
  teacher: "www",
  assistant: "www",
  parent: "www",
  student: "www",
};

/**
 * The portal segment each ERP role lands in — the SINGLE derivation.
 *
 * It lives beside `canSignIn` because they are the same class of question:
 * that one answers "which app may this role sign into", this one answers
 * "and where does it land once inside". It used to be written three times —
 * a switch in `services/notifications/deep-link.ts`, `PORTAL_BY_ROLE` in the
 * ERP, and `uiRoleForRole`'s `center_admin ? "admin" : role` — all agreeing by
 * hand. A seventh role would have had to be remembered in all three, and
 * missing one sends either a notification deep link or the portal gate
 * somewhere wrong.
 *
 * Order is load-bearing: `NOTIFICATION_PORTALS` is iterated by tests.
 */
export const PORTAL_SEGMENTS = [
  "student",
  "parent",
  "teacher",
  "assistant",
  "admin",
  "staff",
] as const;

export type PortalSegment = (typeof PORTAL_SEGMENTS)[number];

export const PORTAL_SEGMENT_BY_ROLE = {
  center_admin: "admin",
  center_staff: "staff",
  teacher: "teacher",
  assistant: "assistant",
  student: "student",
  parent: "parent",
} as const satisfies Partial<Record<Role, PortalSegment>>;

export type PortalRole = keyof typeof PORTAL_SEGMENT_BY_ROLE;

export function portalSegmentForRole(
  role: string | null | undefined,
): PortalSegment | null {
  if (!role) return null;
  return PORTAL_SEGMENT_BY_ROLE[role as PortalRole] ?? null;
}

export function canSignIn(app: LoginApp, role: string | null | undefined): boolean {
  return !!role && LOGIN_APP[role as Role] === app;
}

function rolesFor(app: LoginApp): ReadonlySet<Role> {
  return new Set(
    (Object.keys(LOGIN_APP) as Role[]).filter((role) => LOGIN_APP[role] === app),
  );
}

export const WWW_LOGIN_ROLES: ReadonlySet<Role> = rolesFor("www");
export const SUPERADMIN_LOGIN_ROLES: ReadonlySet<Role> = rolesFor("superadmin");

export async function resolveLoginCenterId(
  role: string,
  userId: string,
): Promise<string | undefined> {
  if (role === "center_admin") {
    const profile = await withPlatformContext((tx) =>
      tx.centerAdminProfile.findFirst({
        where: { userId },
        select: { centerId: true },
      }),
    );
    return profile?.centerId ?? undefined;
  }
  if (role === "center_staff") {
    const link = await withPlatformContext((tx) =>
      tx.centerStaff.findFirst({
        where: { staffUserId: userId, removedAt: null },
        select: { centerId: true },
      }),
    );
    return link?.centerId ?? undefined;
  }
  return undefined;
}
