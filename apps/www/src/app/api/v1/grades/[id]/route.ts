import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { getGrade, updateGrade, deleteGrade } from "@/lib/services/grades/grades";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const grade = await getGrade(gradeId, user);
  return ok(grade);
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  maxScore: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("teacher");
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const data = await parseJson(req, patchSchema);
  const grade = await updateGrade(gradeId, data, user);
  return ok(grade);
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher");
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const result = await deleteGrade(gradeId, user);
  return ok(result);
});
