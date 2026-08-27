import type { Transporter } from "nodemailer";

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

const SMTP_REQUIRED = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;

export function normalizeSmtpPass(raw: string): string {
  const trimmed = raw.trim();
  return /^[A-Za-z0-9]{4}(?:[ \t][A-Za-z0-9]{4}){3}$/.test(trimmed)
    ? trimmed.replace(/[ \t]/g, "")
    : trimmed;
}

function smtpPass(): string {
  return normalizeSmtpPass(process.env.SMTP_PASS ?? "");
}

function missingSmtpVars(): string[] {
  return SMTP_REQUIRED.filter((key) =>
    key === "SMTP_PASS" ? smtpPass().length === 0 : !process.env[key],
  );
}

export function isMailConfigured(): boolean {
  return mailProvider() === "smtp" && missingSmtpVars().length === 0;
}

let cached: { key: string; transporter: Transporter } | null = null;

async function getTransporter(): Promise<Transporter> {
  const host = process.env.SMTP_HOST as string;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER as string;
  const pass = smtpPass();
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  const { createHash } = await import("node:crypto");
  const passFingerprint = createHash("sha256").update(pass).digest("hex").slice(0, 12);
  const key = `${host}:${port}:${secure}:${user}:${passFingerprint}`;
  if (cached?.key === key) return cached.transporter;

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  cached = { key, transporter };
  return transporter;
}

export async function verifySmtp(): Promise<{ ok: boolean; code?: string }> {
  if (!isMailConfigured()) return { ok: false, code: "unconfigured" };
  try {
    const t = await getTransporter();
    await t.verify();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: /auth|password|credentials|534|535/i.test(msg) ? "auth_failed" : "connect_failed",
    };
  }
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const provider = mailProvider();
  const from = process.env.MAIL_FROM || "no-reply@edura.local";
  const replyTo = mail.replyTo ?? process.env.MAIL_REPLY_TO ?? undefined;

  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[mail] MAIL_PROVIDER is 'console' in production — nothing was delivered to ${mail.to} ("${mail.subject}"). Set MAIL_PROVIDER=smtp.`,
      );
      return { sent: false, error: "Mail provider is 'console' (no delivery)" };
    }
    // eslint-disable-next-line no-console
    console.log("\n[mail]", {
      from,
      to: mail.to,
      subject: mail.subject,
      body: mail.text || mail.html,
    });
    return { sent: false };
  }

  const missing = missingSmtpVars();
  if (missing.length > 0) {
    const error = `SMTP not configured: missing ${missing.join(", ")}`;
    console.error(`[mail] ${error}`);
    return { sent: false, error };
  }

  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[mail] delivery to ${mail.to} failed: ${error}`);
    return { sent: false, error };
  }
}

export async function verifyMailConnection(): Promise<MailResult> {
  if (mailProvider() === "console") {
    return { sent: false, error: "MAIL_PROVIDER is 'console' — nothing to verify" };
  }
  const missing = missingSmtpVars();
  if (missing.length > 0) {
    return { sent: false, error: `SMTP not configured: missing ${missing.join(", ")}` };
  }
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
