import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminBroadcast } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    scope: z.enum(["center", "course"]),
    courseId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminBroadcast(user, id, body));
});
