import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { registerStudent } from "@/lib/services/auth/register";
import { emailSchema, localeSchema, nameSchema, passwordSchema, phoneSchema } from "@/lib/validation/common";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

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
