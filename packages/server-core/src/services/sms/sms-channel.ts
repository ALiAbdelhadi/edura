import { resolveSmsDriver, type SmsMessage } from "./index";

export function isSmsConfigured(): boolean {
  return Boolean(process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== "console");
}

export async function sendSms(message: SmsMessage): Promise<{ sent: boolean }> {
  return resolveSmsDriver().send(message);
}

export async function smsToUser(phone: string | null | undefined, body: string): Promise<void> {
  if (!phone) return;
  await sendSms({ to: phone, body }).catch(() => {});
}
