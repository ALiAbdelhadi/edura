import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { resetPassword } from "@repo/server-core/services/auth/password-reset";
import { passwordSchema } from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

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
