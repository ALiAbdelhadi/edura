import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setContactSubmissionStatus } from "@/lib/services/admin/contact-submissions";

export const dynamic = "force-dynamic";

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
