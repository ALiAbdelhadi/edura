import { withErrors } from "@repo/server-core/errors/http";
import { runAfter } from "@repo/server-core/http/after";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { checkRateLimit } from "@repo/server-core/rate-limit/token-bucket";
import { requestPasswordReset } from "@repo/server-core/services/auth/password-reset";
import {
  PER_EMAIL_CAPACITY,
  PER_EMAIL_REFILL_PER_MINUTE,
  resetEmailKey,
} from "@repo/server-core/services/auth/reset-throttle";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

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
