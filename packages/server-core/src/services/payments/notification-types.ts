/**
 * The notification a successful settlement asks its caller to send.
 *
 * Declared here (rather than in payment-intents, which owns the webhook flow
 * and stays in apps/www) because the subscription settlement path in the kernel
 * returns this shape. One declaration, imported by both sides.
 */
export type SettleNotification = {
  /** The student the settled money is for; the default fan-out keys on it. */
  studentId: string;
  /**
   * Explicit recipient list, when the default `studentAndParents(studentId)`
   * fan-out is the wrong answer. A PARENT wallet top-up is the case that needs
   * it: no child is involved, so the notification goes to the parent alone.
   * Left unset by every student-facing settlement, which keeps the existing
   * behaviour byte-for-byte.
   */
  recipients?: string[];
  type: "payment_recorded";
  title: string;
  body: string;
  data: Record<string, unknown>;
};
