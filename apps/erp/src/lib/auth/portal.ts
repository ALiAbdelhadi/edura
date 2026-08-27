export const PORTAL_BY_ROLE = {
  center_admin: "/dashboard/admin",
  center_staff: "/dashboard/staff",
  teacher: "/dashboard/teacher",
  assistant: "/dashboard/assistant",
  student: "/dashboard/student",
  parent: "/dashboard/parent",
} as const satisfies Record<string, string>;

export type PortalRole = keyof typeof PORTAL_BY_ROLE;

export function portalForRole(role: string | null | undefined): string | null {
  if (!role) return null;
  return PORTAL_BY_ROLE[role as PortalRole] ?? null;
}

export function uiRoleForRole(role: string): string {
  return role === "center_admin" ? "admin" : role;
}
