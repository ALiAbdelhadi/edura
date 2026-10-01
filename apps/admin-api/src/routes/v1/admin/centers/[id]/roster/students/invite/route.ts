import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adminInviteStudent } from "@repo/server-core/backoffice/admin/center-people";

const bodySchema = z
  .object({
    email: z.email().toLowerCase().trim(),
    name: z.string().trim().min(1).optional(),
  })
  .strict();

const LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  const { token, ...result } = await adminInviteStudent(user, id, body);
  return ok(result, { status: 201, meta: LEAK_TOKEN ? { inviteToken: token } : undefined });
});
