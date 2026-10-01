import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { getMyAttendance } from "@repo/server-core/services/me/attendance";

export const GET = withErrors(async (req) => {
  const user = await requireSession();

  const url = new URL(req.url);
  const studentIdParam = url.searchParams.get("studentId") ?? undefined;

  return ok(await getMyAttendance(user, studentIdParam));
});
