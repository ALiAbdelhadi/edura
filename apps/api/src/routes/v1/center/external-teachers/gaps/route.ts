import { ACCOUNTANT, centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { ok } from "@repo/server-core/http/envelope";
import { buildGapReport } from "@repo/server-core/services/external-teachers/index";

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
