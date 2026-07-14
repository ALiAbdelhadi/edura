import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { approveBooking } from "@/lib/services/bookings/classroom-bookings";

export const dynamic = "force-dynamic";
const schema = z.object({ center_share: z.number().int().min(0).max(99999900) });

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { center_share } = await parseJson(req, schema);
  return ok(await approveBooking(id, center_share, user));
});
