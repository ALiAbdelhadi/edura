import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminInviteTeacher } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: z.email().toLowerCase().trim(),
    name: z.string().trim().min(1).optional(),
  })
  .strict();

const LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  const { token, ...result } = await adminInviteTeacher(user, id, body);
  return ok(result, { status: 201, meta: LEAK_TOKEN ? { inviteToken: token } : undefined });
});
