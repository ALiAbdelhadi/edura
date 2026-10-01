import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  anonymizeApproved,
  approveDeletion,
  rejectDeletion,
} from "@repo/server-core/services/data-rights/account-deletion";

const schema = z
  .object({
    decision: z.enum(["approve", "reject", "anonymize"]),
    note: z.string().max(1000).optional(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const locale = body.locale ?? "ar";

  if (body.decision === "approve") {
    return ok(await approveDeletion(user, id, body.note ?? "", locale));
  }
  if (body.decision === "reject") {
    return ok(await rejectDeletion(user, id, body.note ?? ""));
  }
  return ok(await anonymizeApproved(user, id, locale));
});
