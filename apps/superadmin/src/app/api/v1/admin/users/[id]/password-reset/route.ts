import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { sendPasswordReset } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

// The admin never sees or sets the password — the user receives a link and
// chooses their own, exactly like the invite flow.
export const POST = withErrors(async (_req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await sendPasswordReset(actor, id), { status: 201 });
});
