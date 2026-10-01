import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { delegated } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { bulkUpsertScores } from "@repo/server-core/services/grades/grades";

const scoresSchema = z.array(
  z.object({
    studentId: z.string().min(1),
    score: z.number().min(0),
  }),
).min(1);

export const PUT = delegated(async (req, ctx, { acting: user }) => {
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const scores = await parseJson(req, scoresSchema);
  const grade = await bulkUpsertScores(gradeId, scores, user);
  return ok(grade);
});
