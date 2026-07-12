import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listBookingRequests } from "@/lib/services/bookings/classroomBookings";

export const dynamic = "force-dynamic";

// PRD §4.4 GET /center/booking-requests?status=pending
export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await listBookingRequests(user, status ?? undefined));
});
