import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { registerStudent } from "@repo/server-core/services/auth/register";
import { sendStudentWelcomeEmail } from "@repo/server-core/services/onboarding/welcome-email";
import { emailSchema, localeSchema, nameSchema, passwordSchema, phoneSchema } from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema.optional(),
  locale: localeSchema,
  inviteCode: z.string().trim().min(1).max(20).optional(),
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const input = await parseJson(req, bodySchema);
    const result = await registerStudent(input);
    void sendStudentWelcomeEmail(result.userId);
    return ok(result, { status: 201 });
  }),
  20,
  20,
);
