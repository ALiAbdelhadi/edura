import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { confirmEmailChange } from "@repo/server-core/services/auth/email-change";

export const dynamic = "force-dynamic";

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
