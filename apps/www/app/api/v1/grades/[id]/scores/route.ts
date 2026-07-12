import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { bulkUpsertScores } from "@/lib/services/grades/grades";

export const dynamic = "force-dynamic";

const scoresSchema = z.array(
  z.object({
    studentId: z.string().min(1),
    score: z.number().min(0),
  }),
).min(1);

export const PUT = withErrors(async (req, ctx) => {
  const user = await requireRole("teacher");
  const gradeId = ((await ctx?.params) as { id: string }).id;
  const scores = await parseJson(req, scoresSchema);
  const grade = await bulkUpsertScores(gradeId, scores, user);
  return ok(grade);
});
