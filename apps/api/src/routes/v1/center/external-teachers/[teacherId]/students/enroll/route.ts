import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { enrollManualStudent } from "@repo/server-core/services/external-teachers/index";

const bodySchema = z.object({
  studentId: z.uuid(),
  courseId: z.uuid(),
});

export const POST = centerStaff(
  async (req, ctx, actor) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    const body = await parseJson(req, bodySchema);
    return ok(await enrollManualStudent(actor, teacherId, body), { status: 201 });
  },
  { allow: RECEPTION },
);
