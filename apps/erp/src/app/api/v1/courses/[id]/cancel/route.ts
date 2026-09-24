import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { cancelCourse } from "@repo/server-core/services/center/courses";
import { invalidatesPublicData } from "@/lib/cache/public-data";

export const dynamic = "force-dynamic";

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
