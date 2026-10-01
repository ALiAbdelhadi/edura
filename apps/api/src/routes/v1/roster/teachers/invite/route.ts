import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { inviteTeacher } from "@repo/server-core/services/center/roster";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim().min(1).optional(),
  createShell: z.boolean().optional(),
});

const LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const POST = withErrors(async (req) => {
  const adminUser = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);
  const { token, ...result } = await inviteTeacher(adminUser, body);
  return ok(result, {
    status: 201,
    meta: LEAK_TOKEN ? { inviteToken: token } : undefined,
  });
});
