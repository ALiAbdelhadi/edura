/**
 * The ONE role -> portal map for www.
 *
 * Keyed by the DB role (`users.role`) — the same value `/api/v1/me` returns and
 * the same value each portal layout passes to `RoleGuard`. Routing decisions
 * must be derived from the SERVER session, never from a cached client value:
 * when the role router and the role guard disagreed about who the user was,
 * they redirected at each other forever (the account-switch spinner trap).
 *
 * `edura_state` in localStorage is a DISPLAY cache (name/email for first paint)
 * and is deliberately not consulted here.
 */
export const PORTAL_BY_ROLE = {
  center_admin: "/dashboard/admin",
  center_staff: "/dashboard/staff",
  teacher: "/dashboard/teacher",
  assistant: "/dashboard/assistant",
  student: "/dashboard/student",
  parent: "/dashboard/parent",
} as const satisfies Record<string, string>;

export type PortalRole = keyof typeof PORTAL_BY_ROLE;

/** The portal a role owns, or null for a role www does not host. */
export function portalForRole(role: string | null | undefined): string | null {
  if (!role) return null;
  return PORTAL_BY_ROLE[role as PortalRole] ?? null;
}

/**
 * The UI-facing role label kept in `edura_state` (legacy shape: `center_admin`
 * is stored as `admin`). Kept so the cached display name/email survives, but it
 * is never used to decide a route.
 */
export function uiRoleForRole(role: string): string {
  return role === "center_admin" ? "admin" : role;
}
