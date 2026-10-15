export type SmsMessage = { to: string; body: string };

export type SmsResult = { sent: boolean };

export interface SmsDriver {
  readonly name: "console" | "unsupported";
  send(message: SmsMessage): Promise<SmsResult>;
}

export function smsProvider(): string {
  return process.env.SMS_PROVIDER ?? "console";
}
