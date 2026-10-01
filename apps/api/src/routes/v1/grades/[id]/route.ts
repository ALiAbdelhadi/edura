import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { delegated, toActingUser } from "@repo/server-core/authz/teacher-actor";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { getGrade, updateGrade, deleteGrade } from "@repo/server-core/services/grades/grades";

export const GET = withErrors(async (_req, ctx) => {
  const user = await toActingUser(await requireSession());
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const grade = await getGrade(gradeId, user);
  return ok(grade);
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  maxScore: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const PATCH = delegated(async (req, ctx, { acting: user }) => {
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const data = await parseJson(req, patchSchema);
  const grade = await updateGrade(gradeId, data, user);
  return ok(grade);
});

export const DELETE = delegated(async (_req, ctx, { acting: user }) => {
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const result = await deleteGrade(gradeId, user);
  return ok(result);
});
