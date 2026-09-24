import { withErrors } from "@/lib/errors/http";
import { runAfter } from "@/lib/http/after";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";
import { requestPasswordReset } from "@/lib/services/auth/password-reset";
import {
  PER_EMAIL_CAPACITY,
  PER_EMAIL_REFILL_PER_MINUTE,
  resetEmailKey,
} from "@/lib/services/auth/reset-throttle";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  locale: z.enum(["ar", "en"]).optional(),
});

const RESPONSE = { message: "If an account exists with that email, a reset link has been sent." };

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
