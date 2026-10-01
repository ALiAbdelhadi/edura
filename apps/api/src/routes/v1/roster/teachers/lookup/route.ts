import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { lookupTeacher } from "@repo/server-core/services/center/roster";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("center_admin");
    const body = await parseJson(req, bodySchema);
    return ok(await lookupTeacher(user, body));
  }),
  20,
  20,
);
