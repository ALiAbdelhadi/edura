import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { cancelCourse } from "@repo/server-core/services/center/courses";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

const bodySchema = z.object({
  reason: z.string().min(1),
});

const handlePost = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  await cancelCourse(user, id, reason);
  return ok({ cancelled: true });
});

export const POST = invalidatesPublicData(handlePost);
