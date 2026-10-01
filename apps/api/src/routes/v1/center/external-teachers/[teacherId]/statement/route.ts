import { ACCOUNTANT, centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { ok } from "@repo/server-core/http/envelope";
import { buildStatement } from "@repo/server-core/services/external-teachers/index";

export const GET = centerStaff(
  async (req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    const url = new URL(req.url);

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );

    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const from = fromParam ? new Date(fromParam) : monthStart;
    const to = toParam ? new Date(toParam) : monthEnd;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BusinessRuleError("Invalid date range");
    }

    return ok(await buildStatement(acting, teacherId, { from, to }));
  },
  { allow: [...MANAGER, ...ACCOUNTANT] },
);
