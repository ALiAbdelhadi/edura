/**
 * The notification a successful settlement asks its caller to send.
 *
 * Declared here (rather than in payment-intents, which owns the webhook flow
 * and stays in apps/www) because the subscription settlement path in the kernel
 * returns this shape. One declaration, imported by both sides.
 */
export type SettleNotification = {
  studentId: string;
  type: "payment_recorded";
  title: string;
  body: string;
  data: Record<string, unknown>;
};
