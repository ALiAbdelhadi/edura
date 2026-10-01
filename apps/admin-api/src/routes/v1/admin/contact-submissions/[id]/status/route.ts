import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setContactSubmissionStatus } from "@repo/server-core/backoffice/admin/contact-submissions";

const schema = z
  .object({
    status: z.enum(["new", "handled", "spam"]),
    note: z.string().max(1000).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  return ok(await setContactSubmissionStatus(user, id, body.status, body.note));
});
