import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createManualGrade, listManualGrades } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    const courseId = new URL(req.url).searchParams.get("courseId");
    return ok(await listManualGrades(acting, teacherId, { courseId }));
  },
  { allow: RECEPTION },
);

const createSchema = z.object({
  courseId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  gradeType: z.enum(["numeric", "letter"]).optional(),
  maxScore: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = centerStaff(
  async (req, ctx, actor) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    const data = await parseJson(req, createSchema);
    return ok(await createManualGrade(actor, teacherId, data), { status: 201 });
  },
  { allow: RECEPTION },
);
