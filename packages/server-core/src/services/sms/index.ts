import { consoleSmsDriver, unsupportedSmsDriver } from "./console-driver";
import type { SmsDriver } from "./types";
import { smsProvider } from "./types";

export type { SmsDriver, SmsMessage, SmsResult } from "./types";
export { smsProvider } from "./types";

export function resolveSmsDriver(): SmsDriver {
  const provider = smsProvider();
  return provider === "console" ? consoleSmsDriver : unsupportedSmsDriver(provider);
}
