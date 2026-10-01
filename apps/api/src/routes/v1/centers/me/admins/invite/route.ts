import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { inviteCenterAdmin } from "@repo/server-core/services/center/admins";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const POST = withErrors(async (req) => {
  const adminUser = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);
  const { token: _token, existingUser, invited } = await inviteCenterAdmin(adminUser, body);
  return ok({ invited, existingUser }, existingUser ? undefined : { status: 201 });
});
