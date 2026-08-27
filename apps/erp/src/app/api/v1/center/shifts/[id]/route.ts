import { centerStaff } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getShiftSummary } from "@/lib/services/center/shifts";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    return ok(await getShiftSummary(user, id));
  },
  { allow: ["receptionist", "manager", "center_accountant"] },
);
