import { NextResponse } from "next/server";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok, fail } from "@/lib/http/envelope";
import { resolveDriver } from "@/lib/services/payments/gateway";
import { processWebhookEvent } from "@/lib/services/payments/payment-intents";

export const dynamic = "force-dynamic";

/**
 * Gateway callback (Paymob "transaction processed"). Unauthenticated by
 * nature — authenticity comes from the HMAC signature, verified by the
 * active driver. Fully idempotent: replays return 200 without re-settling.
 * The charged amount is NEVER read from this payload.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const rawBody = await req.text();
    const query = Object.fromEntries(new URL(req.url).searchParams);

    const verification = resolveDriver().verifyWebhook(rawBody, query);
    if (!verification.valid) {
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
      // Unknown order id: 200 so the gateway stops retrying, but say so.
      return NextResponse.json({ data: { ignored: true, reason: outcome.reason } });
    }
    return ok({ intentId: outcome.intentId, result: outcome.result });
  }),
  120,
  120,
);
