import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { ok, fail } from "@repo/server-core/http/envelope";
import { resolveDriver } from "@repo/server-core/services/payments/gateway/index";
import { processWebhookEvent } from "@repo/server-core/services/payments/payment-intents";

export const POST = withRateLimit(
  withErrors(async (req) => {
    const rawBody = await req.text();
    const query = Object.fromEntries(new URL(req.url).searchParams);

    const verification = resolveDriver().verifyWebhook(rawBody, query);
    if (!verification.valid) {
      if (verification.ignore) {
        return Response.json({ data: { ignored: true, reason: verification.error } });
      }
      return fail(401, "invalid_signature", verification.error);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }

    const outcome = await processWebhookEvent(verification.event, payload);
    if (!outcome.handled) {
      return Response.json({ data: { ignored: true, reason: outcome.reason } });
    }
    return ok({ intentId: outcome.intentId, result: outcome.result });
  }),
  120,
  120,
);
