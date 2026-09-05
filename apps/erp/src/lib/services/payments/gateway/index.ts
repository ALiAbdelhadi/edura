import type { PaymentGatewayDriver } from "./types";
import { mockDriver } from "./mock-driver";
import { paymobDriver } from "./paymob-driver";
import { paymentsMode } from "./types";

export type { PaymentGatewayDriver, WebhookEvent, WebhookEventKind, CheckoutInfo } from "./types";
export {
  paymentsMode,
  onlineCheckoutAvailable,
  integrationAllowed,
  paymobIntegrationIds,
  deriveEventKind,
} from "./types";
export { signMockWebhook } from "./mock-driver";

/**
 * SECURITY_AUDIT.md M-07. C1 made `PAYMENTS_MODE` explicit and hid the
 * mock-complete route in production, but the mock driver itself was still
 * selectable there — so a production deploy with `PAYMENTS_MODE=mock` and a
 * leaked HMAC secret was a settlement oracle through the public webhook. The
 * mock driver now refuses to exist in production, and `mockDriver.verifyWebhook`
 * refuses independently, so neither guard alone is load-bearing.
 */
export function resolveDriver(): PaymentGatewayDriver {
  const mode = paymentsMode();
  if (mode === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PAYMENTS_MODE=mock is not allowed in production — set sandbox or live");
    }
    return mockDriver;
  }
  return paymobDriver;
}
