import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { approveBooking } from "@/lib/services/bookings/classroomBookings";

export const dynamic = "force-dynamic";
const schema = z.object({ center_share: z.number().int().min(0).max(99999900) });

// PRD §4.4 POST /center/booking-requests/:id/approve {center_share}
export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { center_share } = await parseJson(req, schema);
  return ok(await approveBooking(id, center_share, user));
});
