import { centerStaff } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getShiftSummary } from "@repo/server-core/services/center/shifts";

export const GET = centerStaff(
  async (_req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    return ok(await getShiftSummary(user, id));
  },
  { allow: ["receptionist", "manager", "center_accountant"] },
);
