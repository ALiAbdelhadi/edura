import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { recordContactSubmission } from "@repo/server-core/services/marketing/contact";
import { parseJson } from "@repo/server-core/validation/zod";
import { trustedClientIp } from "@repo/server-core/rate-limit/token-bucket";
import { z } from "zod";

const bodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    subject: z.enum(["demo", "pricing", "support", "partnership", "other"]),
    message: z.string().trim().min(10).max(4000),
    locale: z.enum(["ar", "en"]),
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const body = await parseJson(req, bodySchema);

    await recordContactSubmission({
      name: body.name,
      email: body.email,
      phone: body.phone ? body.phone : null,
      subject: body.subject,
      message: body.message,
      locale: body.locale,
      ip: trustedClientIp((n) => req.headers.get(n)) || null,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });

    return ok({ received: true }, { status: 201 });
  }),
  5,
  3,
);
