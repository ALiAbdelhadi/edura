import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setManualGradeScores } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

const scoresSchema = z
  .array(z.object({ studentId: z.uuid(), score: z.number().min(0) }))
  .min(1)
  .max(500);

/**
 * Enter the scores. Same shape and same semantics as the teacher's own
 * endpoint, so the gradebook a parent or student sees is identical whichever
 * side keyed it in — and the same `grade_entered` notification fires.
 */
export const PUT = centerStaff(
  async (req, ctx, actor) => {
    const { teacherId, gradeId } = (await ctx.params) as {
      teacherId: string;
      gradeId: string;
    };
    const scores = await parseJson(req, scoresSchema);
    return ok(await setManualGradeScores(actor, teacherId, gradeId, scores));
  },
  { allow: RECEPTION },
);
