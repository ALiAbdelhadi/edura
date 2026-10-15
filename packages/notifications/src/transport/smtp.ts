import { resolveMailDriver } from "./index";
import type { Mail, MailResult } from "./types";

export type { Mail, MailResult, MailProvider } from "./types";
export { mailProvider } from "./types";
export { normalizeSmtpPass } from "./smtp-driver";
export { resolveMailDriver } from "./index";

export function isMailConfigured(): boolean {
  const driver = resolveMailDriver();
  return driver.name === "smtp" && driver.isConfigured();
}

export async function verifySmtp(): Promise<{ ok: boolean; code?: string }> {
  if (!isMailConfigured()) return { ok: false, code: "unconfigured" };
  const res = await resolveMailDriver().verify();
  if (res.sent) return { ok: true };
  return {
    ok: false,
    code: /auth|password|credentials|534|535/i.test(res.error ?? "") ? "auth_failed" : "connect_failed",
  };
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  return resolveMailDriver().send({
    from: process.env.MAIL_FROM || "no-reply@edura.local",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    replyTo: mail.replyTo ?? process.env.MAIL_REPLY_TO ?? undefined,
  });
}

export async function verifyMailConnection(): Promise<MailResult> {
  return resolveMailDriver().verify();
}
