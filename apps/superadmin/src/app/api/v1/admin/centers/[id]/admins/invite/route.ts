import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminInviteCenterAdmin } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.email().toLowerCase().trim() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  const result = await adminInviteCenterAdmin(user, id, body);
  // The raw invite token is deliberately NOT returned here: a center-admin
  // invite is a co-ownership grant, and the link goes to the invitee's inbox
  // only — never back through the back-office response.
  return ok({ invited: result.invited, existingUser: result.existingUser }, { status: 201 });
});
