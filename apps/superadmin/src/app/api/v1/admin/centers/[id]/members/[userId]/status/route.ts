import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setCenterMemberStatus } from "@/lib/services/admin/center-control";

// Control ops #2/#3 — activate / deactivate a TEACHER or STUDENT within this
// center. Account-level only: the roster, affiliation and enrollments are
// untouched, so reactivation restores the exact prior state. Deactivation cuts
// the account's session on its next request (C-03).
export const dynamic = "force-dynamic";

const schema = z
  .object({
    kind: z.enum(["teacher", "student"]),
    action: z.enum(["activate", "deactivate"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, userId } = await ctx.params;
  const { kind, action, reason } = await parseJson(req, schema);
  return ok(await setCenterMemberStatus(id, userId, kind, action, reason, user));
});
