import { ACCOUNTANT, centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { buildGapReport } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

/**
 * "What have we missed?" across the center's off-system teachers.
 *
 * Manual entry fails SILENTLY — a lesson nobody marked attendance for simply
 * has no attendance, and nothing complains. This is the report that complains.
 * Every finding names the exact row to open and says whether it is blocking
 * (money stuck, lesson unrecorded) or a warning.
 *
 * Read-only, so the read-only finance tier sees it too — an unsettled lesson is
 * a finance problem as much as an operations one.
 */
export const GET = centerStaff(
  async (req, _ctx, { acting }) => {
    const url = new URL(req.url);
    const teacherId = url.searchParams.get("teacherId");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam ? new Date(toParam) : undefined;
    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime()))
    ) {
      throw new BusinessRuleError("Invalid date range");
    }

    return ok(await buildGapReport(acting, { teacherId, from, to }));
  },
  { allow: [...MANAGER, ...ACCOUNTANT] },
);
