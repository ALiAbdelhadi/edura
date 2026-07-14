import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { ok } from "@/lib/http/envelope";
import { requestPasswordReset } from "@/lib/services/auth/password-reset";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { email } = await parseJson(req, bodySchema);
    await requestPasswordReset(email);
    return ok({ message: "If an account exists with that email, a reset link has been sent." });
  }),
  5,
  60,
);
