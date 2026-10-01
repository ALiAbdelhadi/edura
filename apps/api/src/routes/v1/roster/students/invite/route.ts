import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { inviteStudent } from "@repo/server-core/services/center/roster";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim().min(1).optional(),
});

const LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const POST = centerStaff(
  async (req, _ctx, { acting }) => {
    const body = await parseJson(req, bodySchema);
    const { token, ...result } = await inviteStudent(acting, body);
    return ok(result, {
      status: 201,
      meta: LEAK_TOKEN ? { inviteToken: token } : undefined,
    });
  },
  { allow: RECEPTION },
);
