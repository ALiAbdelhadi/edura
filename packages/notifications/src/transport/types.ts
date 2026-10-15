export type Mail = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

export type MailResult = { sent: boolean; messageId?: string; error?: string };

export type MailProvider = "console" | "smtp";

export function mailProvider(): MailProvider {
  const raw = (process.env.MAIL_PROVIDER ?? "console").toLowerCase();
  return raw === "smtp" ? "smtp" : "console";
}

/** A message with its envelope already decided: the driver never picks From or Reply-To. */
export type OutboundMail = {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export interface MailDriver {
  readonly name: MailProvider;
  /** True when the driver can actually deliver. */
  isConfigured(): boolean;
  send(mail: OutboundMail): Promise<MailResult>;
  /** Checks the connection; `sent: true` means it answered. */
  verify(): Promise<MailResult>;
}
