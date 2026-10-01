import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { emailSchema } from "@repo/server-core/validation/common";
import { startEmailChange } from "@repo/server-core/services/account/email";

const bodySchema = z
  .object({
    email: emailSchema,
    currentPassword: z.string().min(1).optional(),
  })
  .strict();

/**
 * SECURITY_AUDIT.md M-06. This used to switch `users.email` on the spot. Now it
 * only re-proves the password and files a REQUEST; the switch happens in
 * POST /api/v1/me/email/confirm with the token mailed to the NEW address, and
 * the OLD address is told. Response shape: `{ email: <current>, pending: true }`.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { email, currentPassword } = await parseJson(req, bodySchema);
    return ok(await startEmailChange(session.id, email, currentPassword));
  }),
  10,
  10,
);
