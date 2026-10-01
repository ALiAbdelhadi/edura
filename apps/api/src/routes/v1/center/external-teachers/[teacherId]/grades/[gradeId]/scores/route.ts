import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setManualGradeScores } from "@repo/server-core/services/external-teachers/index";

const scoresSchema = z
  .array(z.object({ studentId: z.uuid(), score: z.number().min(0) }))
  .min(1)
  .max(500);

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
