import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { inviteTeacher } from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim().min(1).optional(),
  createShell: z.boolean().optional(),
});

// Dev/E2E only — the echo decision stays at the edge, not in the service.
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
