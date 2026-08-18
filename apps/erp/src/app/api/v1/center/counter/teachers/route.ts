import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { listCounterTeachers } from "@repo/server-core/services/attendance/counter";

export const dynamic = "force-dynamic";

/** The counter board's teacher picker: every affiliated teacher, today's
 *  schedule deciding the order and the default. */
export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const q = new URL(req.url).searchParams.get("q");
    return ok(await listCounterTeachers(user, { q }));
  },
  { allow: RECEPTION },
);
