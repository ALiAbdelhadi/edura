import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { lookupStudents } from "@repo/server-core/services/attendance/checkin";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok(await lookupStudents(q, user));
  },
  { allow: RECEPTION },
);
