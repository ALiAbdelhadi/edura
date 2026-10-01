import type { getStaffMe } from "@repo/server-core/services/center/staff";

// The staff portal's own read (layout + page, one round-trip via cache()).
// getStaffMe throws ForbiddenError for a staff user with no centre link; over
// HTTP that is the route's 403, which both callers send to login as before.
export const STAFF_ME_PATH = "/api/v1/center/staff/me";
export type StaffMe = Awaited<ReturnType<typeof getStaffMe>>;
