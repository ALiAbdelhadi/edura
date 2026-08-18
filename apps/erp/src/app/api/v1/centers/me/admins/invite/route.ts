import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { inviteCenterAdmin } from "@repo/server-core/services/center/admins";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const POST = withErrors(async (req) => {
  const adminUser = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);
  const { token: _token, existingUser, invited } = await inviteCenterAdmin(adminUser, body);
  // Response shape is unchanged: 200 for an existing user, 201 for a new shell.
  return ok({ invited, existingUser }, existingUser ? undefined : { status: 201 });
});
