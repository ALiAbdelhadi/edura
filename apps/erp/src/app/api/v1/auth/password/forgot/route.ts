import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";
import { runAfter } from "@/lib/http/after";
import { parseJson } from "@/lib/validation/zod";
import { ok } from "@/lib/http/envelope";
import { requestPasswordReset } from "@/lib/services/auth/password-reset";
import {
  PER_EMAIL_CAPACITY,
  PER_EMAIL_REFILL_PER_MINUTE,
  resetEmailKey,
} from "@/lib/services/auth/reset-throttle";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  locale: z.enum(["ar", "en"]).optional(),
});

const RESPONSE = { message: "If an account exists with that email, a reset link has been sent." };

/**
 * SECURITY_AUDIT.md M-11. Three changes, one shape:
 *  (a) a per-EMAIL bucket beside the per-IP one — sixty mails a minute to one
 *      victim from one IP was allowed, and IPs are cheap;
 *  (b) the reset itself runs AFTER the response (`runAfter`), so the answer
 *      carries no timing difference between an unknown address, a known one,
 *      a throttled one and a back-office one — the response is the same bytes
 *      at the same moment in every case;
 *  (c) `app: "www"` is passed through, so a back-office account is refused
 *      here and only its own app can start its reset.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const { email, locale } = await parseJson(req, bodySchema);
    const normalized = email.toLowerCase().trim();
    if (await checkRateLimit(resetEmailKey(normalized), PER_EMAIL_CAPACITY, PER_EMAIL_REFILL_PER_MINUTE)) {
      runAfter(() => requestPasswordReset(normalized, locale, { app: "www" }));
    }
    return ok(RESPONSE);
  }),
  5,
  60,
);
