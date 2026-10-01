import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { listTeacherSubjects } from "@repo/server-core/services/teacher/subjects";

export const GET = withErrors(async () => {
  await requireRole("teacher", "assistant");
  const raw = await getSessionUser();
  const user = raw ? await toActingUser(raw) : null;
  const teacherId = user?.role === "teacher" ? user.id : null;
  if (!teacherId) return ok([]);

  return ok(await listTeacherSubjects(teacherId));
});
