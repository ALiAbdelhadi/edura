import type { Role } from "@repo/database";
import { withPlatformContext } from "@repo/database";

/**
 * THE single source of truth for "which app may this role sign in to".
 *
 * C-04: there are THREE login doors (apps/www NextAuth credentials, the manual
 * `POST /api/v1/auth/login` REST endpoint, apps/superadmin NextAuth) and each
 * used to declare its own copy of the allowlist. The www copies drifted —
 * `center_staff` was added to one and not the other, so every Center Staff
 * account got a 401 with the correct password on the REST door while NextAuth
 * let them in. Each door now asks THIS module instead of holding a list.
 *
 * The map is an exhaustive `Record<Role, LoginApp>` on purpose, not two
 * independent sets:
 *   - adding a role to the Prisma `Role` enum FAILS TYPECHECK here until it is
 *     classified, so a new role can never be silently missing from a door;
 *   - a role belongs to exactly one app by construction, so www and superadmin
 *     can never both claim (or both drop) the same role.
 *
 * Membership answers ONLY "may this role reach this app's login door". Every
 * finer-grained gate stays exactly where it is: `status === 'active'` and a
 * present password hash at each door, `requireRole()` per route, and the live
 * `center_staff` link re-resolved per request in `authz/center-actor.ts`.
 */
export type LoginApp = "www" | "superadmin";

const LOGIN_APP: Record<Role, LoginApp> = {
  // Back-office staff — apps/superadmin ONLY. A staff account can never mint a
  // www session (project rule: no superadmin functionality inside www).
  super_admin: "superadmin",
  accountant: "superadmin",

  // www — the five public roles plus center_staff (front desk / manager /
  // center-accountant), who act on behalf of a center inside www.
  center_admin: "www",
  center_staff: "www",
  teacher: "www",
  assistant: "www",
  parent: "www",
  student: "www",
};

/**
 * Default-deny: a value that is not a known Role (or is null/undefined) maps to
 * `undefined`, which never equals an app name.
 */
export function canSignIn(app: LoginApp, role: string | null | undefined): boolean {
  return !!role && LOGIN_APP[role as Role] === app;
}

function rolesFor(app: LoginApp): ReadonlySet<Role> {
  return new Set(
    (Object.keys(LOGIN_APP) as Role[]).filter((role) => LOGIN_APP[role] === app),
  );
}

/** Derived views — for tests, tooling and diagnostics. NOT a second list. */
export const WWW_LOGIN_ROLES: ReadonlySet<Role> = rolesFor("www");
export const SUPERADMIN_LOGIN_ROLES: ReadonlySet<Role> = rolesFor("superadmin");

/**
 * The session `centerId` claim, resolved identically for every www login door.
 * This is the second thing the two doors disagreed on: NextAuth resolved a
 * center for `center_staff`, the REST door did not, so a REST-issued staff
 * token carried no center.
 *
 * The claim is a CONVENIENCE, never an authorization fact for staff:
 * `resolveCenterActorContext()` re-reads the live `center_staff` link (WHERE
 * removed_at IS NULL) on every request, so a removed staff member loses access
 * on the next request no matter what the 30-day JWT says.
 */
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
