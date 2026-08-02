import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createManualGrade, listManualGrades } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

/**
 * Grades for an off-system teacher's groups.
 *
 * This route exists because it is the ONE operational surface a center could
 * not already reach: `POST /api/v1/grades` requires `course.teacherId ===
 * caller.id`, which is right for a teacher who signs in and impossible for one
 * who never will. That gate is left exactly as it is — this path can only ever
 * reach a group belonging to an off-system teacher this center manages.
 *
 * The assessment is owned by the TEACHER, not by the staff member who typed it,
 * so it appears in their own gradebook the day they join the platform. Who
 * typed it is in the audit row.
 */
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
