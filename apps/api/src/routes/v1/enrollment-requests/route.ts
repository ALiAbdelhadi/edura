import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  listEnrollmentRequestsForUser,
  createEnrollmentRequest,
} from "@repo/server-core/services/enrollments/requests";

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const url = new URL(req.url);

  const enriched = await listEnrollmentRequestsForUser(user, {
    courseId: url.searchParams.get("courseId"),
    studentId: url.searchParams.get("studentId"),
    status: url.searchParams.get("status"),
  });

  return ok(enriched);
});

const createSchema = z.object({
  courseId: z.string().min(1),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const { courseId } = await parseJson(req, createSchema);

  const request = await createEnrollmentRequest(user, courseId);

  return ok(request, { status: 201 });
});
