import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listBookingRequests } from "@/lib/services/bookings/classroom-bookings";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await listBookingRequests(user, status ?? undefined));
});
