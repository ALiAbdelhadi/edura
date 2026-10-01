import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { registerParent } from "@repo/server-core/services/auth/register";
import { emailSchema, localeSchema, nameSchema, passwordSchema, phoneSchema } from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema.optional(),
  locale: localeSchema,
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const input = await parseJson(req, bodySchema);
    const result = await registerParent(input);
    return ok(result, { status: 201 });
  }),
  20,
  20,
);
