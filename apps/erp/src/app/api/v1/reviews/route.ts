import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createReview, listReviews } from "@/lib/services/reviews/reviews";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireSession();

  const url = new URL(req.url);
  const filters: Record<string, string | undefined> = {
    teacherId: url.searchParams.get("teacherId") ?? undefined,
    studentId: url.searchParams.get("studentId") ?? undefined,
    centerId: url.searchParams.get("centerId") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  if (user.role === "student" && !filters.teacherId) {
    filters.studentId = user.id;
  } else if (user.role === "teacher" && !filters.studentId) {
    filters.teacherId = user.id;
  }

  const result = await listReviews(filters);
  return ok(result.reviews, { meta: { total: result.total, page: result.page, limit: result.limit } });
});

const createSchema = z.object({
  teacherId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(2000).optional(),
  lessonId: z.string().uuid().optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const data = await parseJson(req, createSchema);
  const review = await createReview(data, user);
  return ok(review, { status: 201 });
});
