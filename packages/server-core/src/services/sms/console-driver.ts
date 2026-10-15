import type { SmsDriver } from "./types";

export const consoleSmsDriver: SmsDriver = {
  name: "console",
  async send({ to, body }) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[sms:console] -> ${to}: ${body}`);
    }
    return { sent: false };
  },
};

export function unsupportedSmsDriver(provider: string): SmsDriver {
  return {
    name: "unsupported",
    async send() {
      console.warn(`[sms] provider '${provider}' not implemented; skipping`);
      return { sent: false };
    },
  };
}
