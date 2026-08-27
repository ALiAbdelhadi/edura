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
