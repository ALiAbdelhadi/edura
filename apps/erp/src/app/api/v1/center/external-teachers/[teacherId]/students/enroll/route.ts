import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { enrollManualStudent } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

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
