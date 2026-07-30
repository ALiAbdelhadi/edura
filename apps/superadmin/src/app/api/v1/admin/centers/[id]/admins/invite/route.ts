import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminInviteCenterAdmin } from "@/lib/services/admin/center-people";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.email().toLowerCase().trim() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  const result = await adminInviteCenterAdmin(user, id, body);
  return ok({ invited: result.invited, existingUser: result.existingUser }, { status: 201 });
});
