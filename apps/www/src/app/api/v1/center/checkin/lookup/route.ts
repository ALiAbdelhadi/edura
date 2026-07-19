import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { lookupStudents } from "@/lib/services/attendance/checkin";

export const dynamic = "force-dynamic";

/** Resolve a student by studentCode / phone / name (counter search box). */
export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await lookupStudents(q, user));
});
