import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { delegated, toActingUser } from "@/lib/authz/teacher-actor";
import { requireSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createGrade, listGrades } from "@/lib/services/grades/grades";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await toActingUser(await requireSession());

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") ?? undefined;
  const studentId = url.searchParams.get("studentId") ?? undefined;

  const grades = await listGrades({ courseId, studentId }, user);
  return ok(grades);
});

const createSchema = z.object({
  courseId: z.string().min(1),
  name: z.string().min(1),
  gradeType: z.enum(["numeric", "letter"]).optional(),
  maxScore: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = delegated(async (req, _ctx, { acting: user }) => {
  const data = await parseJson(req, createSchema);
  const grade = await createGrade(data, user);
  return ok(grade, { status: 201 });
});
