import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { sendPasswordReset } from "@/lib/services/admin/admin-users";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// The admin never sees or sets the password — the user receives a link and
// chooses their own, exactly like the invite flow.
export const POST = withErrors(async (req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await sendPasswordReset(actor, id, reason), { status: 201 });
});
