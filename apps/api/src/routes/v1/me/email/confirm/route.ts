import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { confirmEmailChange } from "@repo/server-core/services/auth/email-change";

const bodySchema = z.object({ token: z.string().min(1).max(512) });

/**
 * SECURITY_AUDIT.md M-06 — the second half of a login-email change. Token-
 * authenticated, no session needed (the confirming session is revoked by the
 * switch anyway), rate limited like the password-reset door.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token } = await parseJson(req, bodySchema);
    const { email } = await confirmEmailChange(token);
    return ok({ email, changed: true });
  }),
  10,
  60,
);
