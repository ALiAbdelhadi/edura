import { z } from "zod";
import { parseJson } from "@/lib/validation/zod";
import { emailSchema, passwordSchema, phoneSchema, nameSchema, localeSchema } from "@/lib/validation/common";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { registerStudent } from "@/lib/services/auth/register";

export const dynamic = "force-dynamic";

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
    return ok(result, { status: 201 });
  }),
  20,
  20,
);
