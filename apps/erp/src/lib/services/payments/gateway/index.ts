import type { PaymentGatewayDriver } from "./types";
import { mockDriver } from "./mock-driver";
import { paymobDriver } from "./paymob-driver";
import { paymentsMode } from "./types";

export type { PaymentGatewayDriver, WebhookEvent, CheckoutInfo } from "./types";
export { paymentsMode, onlineCheckoutAvailable } from "./types";
export { signMockWebhook } from "./mock-driver";

/**
 * PAYMENTS_MODE (env, default "mock") picks the driver:
 *   mock            -> mockDriver (fully local, no credentials)
 *   sandbox | live  -> paymobDriver (stub for now; real API wired later)
 */
export function resolveDriver(): PaymentGatewayDriver {
  return paymentsMode() === "mock" ? mockDriver : paymobDriver;
}
