import type { Transporter } from "nodemailer";
import type { MailDriver } from "./types";

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

export const smtpMailDriver: MailDriver = {
  name: "smtp",

  isConfigured() {
    return missingSmtpVars().length === 0;
  },

  async send(mail) {
    const missing = missingSmtpVars();
    if (missing.length > 0) {
      const error = `SMTP not configured: missing ${missing.join(", ")}`;
      console.error(`[mail] ${error}`);
      return { sent: false, error };
    }

    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        replyTo: mail.replyTo,
      });
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[mail] delivery to ${mail.to} failed: ${error}`);
      return { sent: false, error };
    }
  },

  async verify() {
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
  },
};
