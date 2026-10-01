import type { Role } from "@repo/database";
import {
  PORTAL_SEGMENT_BY_ROLE,
  type PortalRole,
  type PortalSegment,
} from "@repo/shared/portal-segments";

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

export {
  PORTAL_SEGMENTS,
  PORTAL_SEGMENT_BY_ROLE,
  portalSegmentForRole,
  type PortalRole,
  type PortalSegment,
} from "@repo/shared/portal-segments";

// The portal segment map moved to @repo/shared/portal-segments so the browser
// can use it; its doc comment says why it is the single derivation. Shared
// cannot import @repo/database, so the Role check it carried stays here, at
// compile time: every key must be a Role, every value a PortalSegment.
PORTAL_SEGMENT_BY_ROLE satisfies Partial<Record<Role, PortalSegment>>;
const PORTAL_ROLES_ARE_ROLES: readonly Role[] = [] as PortalRole[];
void PORTAL_ROLES_ARE_ROLES;

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
