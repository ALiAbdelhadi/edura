import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { reassignCourseTeacher } from "@repo/server-core/services/center/courses";
import { invalidatesPublicData } from "@/lib/cache/public-data";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  teacherId: z.string().min(1),
});

const handlePost = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { teacherId } = await parseJson(req, bodySchema);
  return ok(await reassignCourseTeacher(user, id, teacherId));
});

export const POST = invalidatesPublicData(handlePost);
