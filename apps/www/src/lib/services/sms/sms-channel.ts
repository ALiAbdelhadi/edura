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

  console.warn(`[sms] provider '${provider}' not implemented; skipping`);
  return { sent: false };
}

export async function smsToUser(phone: string | null | undefined, body: string): Promise<void> {
  if (!phone) return;
  await sendSms({ to: phone, body }).catch(() => {});
}
