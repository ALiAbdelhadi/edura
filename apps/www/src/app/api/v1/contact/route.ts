import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { recordContactSubmission } from "@/lib/services/marketing/contact";
import { parseJson } from "@/lib/validation/zod";
import { trustedClientIp } from "@repo/server-core/rate-limit/token-bucket";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The public contact form's only door.
 *
 * UNAUTHENTICATED BY DESIGN — the whole point is that someone with no account
 * can reach us. Everything that would normally be an auth check is therefore a
 * shape check or a limit:
 *
 *  - `.strict()` so an extra field is a 400, not a silently ignored value.
 *  - Every string bounded. An unbounded `message` on an open endpoint is a
 *    free write-amplification primitive against the database.
 *  - `subject` is an enum, not free text, so the back-office queue can filter
 *    on it and a visitor cannot inject arbitrary content into that column.
 *  - Rate limited per IP (see below).
 *
 * The response carries NO id and NO row data. A public endpoint that echoes
 * what it stored is a probe; this one only confirms receipt.
 */
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

/**
 * 5 submissions per IP, refilling at 3/minute.
 *
 * Chosen so a real person who mistypes an email and resubmits three times is
 * never blocked, while a script gets one burst and then a trickle. The limiter
 * is the shared M3 one: Redis-backed when REDIS_URL is set (so the limit holds
 * across instances) and per-process otherwise.
 */
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
      // M3: the trusted proxy hop, not the spoofable leftmost XFF entry.
      ip: trustedClientIp((n) => req.headers.get(n)) || null,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });

    return ok({ received: true }, { status: 201 });
  }),
  5,
  3,
);
