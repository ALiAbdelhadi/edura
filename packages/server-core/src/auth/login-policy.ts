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
