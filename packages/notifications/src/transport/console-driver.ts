import type { MailDriver } from "./types";

export const consoleMailDriver: MailDriver = {
  name: "console",

  isConfigured() {
    return false;
  },

  async send(mail) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[mail] MAIL_PROVIDER is 'console' in production — nothing was delivered to ${mail.to} ("${mail.subject}"). Set MAIL_PROVIDER=smtp.`,
      );
      return { sent: false, error: "Mail provider is 'console' (no delivery)" };
    }
    // eslint-disable-next-line no-console
    console.log("\n[mail]", {
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      body: mail.text || mail.html,
    });
    return { sent: false };
  },

  async verify() {
    return { sent: false, error: "MAIL_PROVIDER is 'console' — nothing to verify" };
  },
};
