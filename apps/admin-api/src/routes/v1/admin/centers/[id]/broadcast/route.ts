import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminBroadcast } from "@repo/server-core/backoffice/admin/center-operations";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({
    scope: z.enum(["center", "course"]),
    courseId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminBroadcast(user, id, body));
});
