import {
  PORTAL_SEGMENT_BY_ROLE,
  portalSegmentForRole,
  type PortalRole,
} from "@repo/shared/portal-segments";

export type { PortalRole };

/**
 * Role -> portal path. DERIVED from the kernel's segment map so the list of
 * roles exists once; see `PORTAL_SEGMENT_BY_ROLE` for why.
 * `tests/unit/account-switch-routing.test.ts` asserts this still equals the
 * set of deployed server gates, so a drift here is a red test.
 */
export const PORTAL_BY_ROLE = Object.fromEntries(
  Object.entries(PORTAL_SEGMENT_BY_ROLE).map(([role, segment]) => [
    role,
    `/dashboard/${segment}`,
  ]),
) as Record<PortalRole, string>;

export function portalForRole(role: string | null | undefined): string | null {
  const segment = portalSegmentForRole(role);
  return segment ? `/dashboard/${segment}` : null;
}

/** The role name the UI shows — the same segment, without the path. */
export function uiRoleForRole(role: string): string {
  return portalSegmentForRole(role) ?? role;
}
