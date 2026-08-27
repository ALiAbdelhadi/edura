import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { lookupStudents } from "@/lib/services/attendance/checkin";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok(await lookupStudents(q, user));
  },
  { allow: RECEPTION },
);
