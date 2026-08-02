import { z } from "zod";
import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  anonymizeApproved,
  approveDeletion,
  rejectDeletion,
} from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    decision: z.enum(["approve", "reject", "anonymize"]),
    // Required for approve and reject. `anonymize` is a repair on an ALREADY
    // approved request, so the reason lives on the original decision.
    note: z.string().max(1000).optional(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

/**
 * The decision endpoint. Each branch is audited inside its service, in the
 * same transaction as the write — so a deletion cannot commit without a row
 * naming who ordered it.
 */
export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
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
