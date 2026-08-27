import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createManualStudent, listTeacherStudents } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    return ok(await listTeacherStudents(acting, teacherId));
  },
  { allow: RECEPTION },
);

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20).nullish(),
  nationalId: z.string().trim().min(14).max(20).nullish(),
  guardianName: z.string().trim().max(120).nullish(),
  guardianPhone: z.string().trim().min(6).max(20).nullish(),
  guardianEmail: z.email().nullish(),
  gradeLevelId: z.uuid().nullish(),
  courseId: z.uuid().nullish(),
});

export const POST = centerStaff(
  async (req, ctx, actor) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    const data = await parseJson(req, createSchema);
    return ok(await createManualStudent(actor, teacherId, data), { status: 201 });
  },
  { allow: RECEPTION },
);
