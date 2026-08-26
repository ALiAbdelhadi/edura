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

/**
 * Delivery driver. `console` (the default) only logs — it is the dev/test mode
 * and delivers NOTHING. `smtp` is the real driver and works with any SMTP host
 * (Brevo, Gmail, Zoho, Mailtrap, Resend's SMTP bridge, a self-hosted relay),
 * so switching provider is an env change, never a code change.
 */
export function mailProvider(): MailProvider {
  const raw = (process.env.MAIL_PROVIDER ?? "console").toLowerCase();
  return raw === "smtp" ? "smtp" : "console";
}

const SMTP_REQUIRED = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;

/**
 * Google shows an app password as four space-separated groups ("abcd efgh ijkl
 * mnop"), and Gmail rejects it verbatim with a misleading
 * "534 Application-specific password required" — as if you'd used the account
 * password. Collapse that EXACT shape so pasting it as displayed just works.
 *
 * Deliberately narrow: only the 4×4 alphanumeric pattern is collapsed, so a
 * password that legitimately contains spaces is never silently mangled. Outer
 * whitespace is always trimmed — a stray trailing space in an env file is never
 * intentional and is otherwise invisible to debug.
 */
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
  // SMTP_PASS is checked AFTER normalization so an all-whitespace value counts
  // as missing rather than reaching Gmail as an empty password.
  return SMTP_REQUIRED.filter((key) =>
    key === "SMTP_PASS" ? smtpPass().length === 0 : !process.env[key],
  );
}

/** True only when a real driver is selected AND fully configured. */
export function isMailConfigured(): boolean {
  return mailProvider() === "smtp" && missingSmtpVars().length === 0;
}

// A pooled transporter is reused across requests — reconnecting per email is
// slow and gets a sender throttled. Keyed on the config so an env change in dev
// (hot reload) rebuilds it instead of silently using the stale connection.
let cached: { key: string; transporter: Transporter } | null = null;

async function getTransporter(): Promise<Transporter> {
  const host = process.env.SMTP_HOST as string;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER as string;
  const pass = smtpPass();
  // Port 465 is implicit TLS; 587/25 start plain and STARTTLS up. Explicit
  // SMTP_SECURE wins for hosts that do not follow the convention.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  // The credential is part of the identity: rotating only SMTP_PASS must rebuild
  // the transporter, not silently keep authenticating with the old one. Hashed
  // so the key stays safe to log.
  const { createHash } = await import("node:crypto");
  const passFingerprint = createHash("sha256").update(pass).digest("hex").slice(0, 12);
  const key = `${host}:${port}:${secure}:${user}:${passFingerprint}`;
  if (cached?.key === key) return cached.transporter;

  // Imported lazily so nodemailer (a Node-only package) is pulled in only when
  // a real send actually happens.
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    // Don't let a hanging SMTP host stall a request thread indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  cached = { key, transporter };
  return transporter;
}

/**
 * Connect + authenticate against the configured SMTP host WITHOUT sending —
 * the deep half of the mail health check (MVP blocker #3's proof). Returns a
 * coarse code, never the provider's raw error text: the endpoint is public
 * and a boolean-grade answer is all operations needs.
 */
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

/**
 * Send one email.
 *
 * NEVER THROWS. Delivery is best-effort across every call site (invites,
 * invoices, notifications, password resets) — a dead SMTP host must not roll
 * back a registration or turn a deliberately-generic API response into a 500
 * that leaks whether an account exists. Callers that care read `sent`.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const provider = mailProvider();
  const from = process.env.MAIL_FROM || "no-reply@edura.local";
  const replyTo = mail.replyTo ?? process.env.MAIL_REPLY_TO ?? undefined;

  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      // Loud, because in production this is almost always a misconfiguration:
      // the email was silently dropped.
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

/**
 * Open a connection and authenticate without sending anything — used by the
 * `mail:verify` script to prove credentials work before trusting a deploy.
 */
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
