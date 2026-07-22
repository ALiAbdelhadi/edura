import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getCourseFillRates } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

// Operational report — MANAGER (and owner).
export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    const result = await getCourseFillRates(user);
    return ok(result);
  },
  { allow: MANAGER },
);
