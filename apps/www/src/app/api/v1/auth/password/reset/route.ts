import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { passwordSchema } from "@/lib/validation/common";
import { ok } from "@/lib/http/envelope";
import { resetPassword } from "@/lib/services/auth/password-reset";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token, password } = await parseJson(req, bodySchema);
    await resetPassword(token, password);
    return ok({ message: "Password has been reset successfully." });
  }),
  10,
  60,
);
