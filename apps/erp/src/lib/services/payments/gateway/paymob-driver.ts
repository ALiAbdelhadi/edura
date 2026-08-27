import type { PaymentIntent } from "@repo/database";
import { BusinessRuleError } from "@/lib/errors/classes";
import type {
  CheckoutStudent,
  CreateCheckoutResult,
  PaymentGatewayDriver,
  WebhookVerification,
} from "./types";

const NOT_IMPLEMENTED =
  "Paymob driver not implemented yet — run with PAYMENTS_MODE=mock for now";

export const paymobDriver: PaymentGatewayDriver = {
  name: "paymob",

  async createCheckout(
    _intent: PaymentIntent,
    _student: CheckoutStudent,
  ): Promise<CreateCheckoutResult> {
    throw new BusinessRuleError(NOT_IMPLEMENTED);
  },

  verifyWebhook(
    _rawBody: string,
    _query: Record<string, string>,
  ): WebhookVerification {
    return { valid: false, error: NOT_IMPLEMENTED };
  },
};
