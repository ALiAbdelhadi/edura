/**
 * SMS channel adapter (PRD §6: SMS for OTP, invite codes, removals, cancellations).
 *
 * Provider-agnostic stub mirroring the FCM adapter. Set SMS_PROVIDER to enable a
 * real gateway; until then it logs in dev and no-ops in production so callers can
 * wire SMS notifications now and swap the transport in later (Open Decision:
 * SMS/WhatsApp provider — PRD §11).
 */
type SmsMessage = { to: string; body: string };

export function isSmsConfigured(): boolean {
  return Boolean(process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== "console");
}

export async function sendSms({ to, body }: SmsMessage): Promise<{ sent: boolean }> {
  const provider = process.env.SMS_PROVIDER ?? "console";

  if (provider === "console") {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[sms:console] -> ${to}: ${body}`);
    }
    return { sent: false };
  }

  // Real providers (e.g. Twilio, Vodafone, unifonic) plug in here once the §11
  // Open Decision is resolved and credentials are provisioned.
  console.warn(`[sms] provider '${provider}' not implemented; skipping`);
  return { sent: false };
}

/** Look up a user's phone and send. No-op if they have no phone on file. */
export async function smsToUser(phone: string | null | undefined, body: string): Promise<void> {
  if (!phone) return;
  await sendSms({ to: phone, body }).catch(() => {});
}
