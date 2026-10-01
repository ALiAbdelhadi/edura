import { z } from "zod";
import { runAfter } from "@repo/server-core/http/after";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { trackFirstStudent } from "@repo/server-core/services/analytics/funnel";
import { enrollStudent } from "@repo/server-core/services/center/enrollments";
import { listEnrollmentsForUser } from "@repo/server-core/services/enrollments/list";

export const GET = withErrors(async (req) => {
  const user = await toActingUser(await requireSession());
  const url = new URL(req.url);

  const studentId = url.searchParams.get("studentId");
  const courseId = url.searchParams.get("courseId");
  const status = url.searchParams.get("status");

  const resolvedStudentId = studentId === "me" ? user.id : studentId;

  const enriched = await listEnrollmentsForUser(user, {
    courseId,
    status,
    studentId: resolvedStudentId,
  });

  return ok(enriched);
});

const createSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);
  const enrollment = await enrollStudent(user, body);
  runAfter(() => trackFirstStudent(user, user.centerId));
  return ok(enrollment, { status: 201 });
});
