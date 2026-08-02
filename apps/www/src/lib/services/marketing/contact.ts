import { platformDb } from "@/lib/db/scope";
import type { Locale } from "@repo/database";

/**
 * Persists a public «تواصل معنا» submission.
 *
 * The table is `contact_submissions` — platform-scoped, no center_id, no RLS,
 * because a sender has no account and no center yet. See the migration
 * `20260802140000_contact_submissions` for why it is written idempotently: the
 * shape existed in the shared dev database before it existed in any branch.
 *
 * Nothing is read back. This module can only ever INSERT, which is what makes
 * "the public form cannot enumerate anything" checkable by reading it.
 *
 * ── Email dispatch ─────────────────────────────────────────────────────────
 * Deliberately NOT wired here — see the TODO at the bottom of this file.
 */

export type ContactSubject = "demo" | "pricing" | "support" | "partnership" | "other";

export type ContactSubmissionInput = {
  name: string;
  email: string;
  phone?: string | null;
  subject: ContactSubject;
  message: string;
  locale: Locale;
  /** Client IP, or null when it cannot be established. Stored in an `inet`. */
  ip: string | null;
  userAgent: string | null;
};

/**
 * `inet` refuses a malformed value with a 22P02 that would surface as a 500 on
 * a public form. The client IP arrives from a proxy header, so it is validated
 * here and dropped to NULL rather than trusted — an unparseable address is not
 * worth failing a lead over.
 */
function asInet(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  if (v4.test(ip) && ip.split(".").every((o) => Number(o) <= 255)) return ip;
  if (ip.includes(":") && v6.test(ip)) return ip;
  return null;
}

export async function recordContactSubmission(input: ContactSubmissionInput): Promise<void> {
  await platformDb((tx) =>
    tx.contactSubmission.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        subject: input.subject,
        message: input.message,
        locale: input.locale,
        source: "website_contact",
        ipAddress: asInet(input.ip),
        userAgent: input.userAgent,
      },
      select: { id: true },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TODO(post-merge glue): notify the team that a lead arrived.
  //
  // The mail layer already exists — `sendMail` from
  // `@repo/server-core/mail/send` (provider-agnostic nodemailer over SMTP,
  // MAIL_PROVIDER=console|smtp). It is NOT called here on purpose: choosing the
  // destination address, the template, and whether a failed send should fail
  // the request is a decision for whoever owns notifications, and a public form
  // must not start returning 500s because an SMTP host is slow.
  //
  // When wiring it, keep these two properties:
  //   * the row is already committed above, so a mail failure loses nothing;
  //   * catch and log — never let a dispatch error reach the visitor.
  //
  // Suggested shape:
  //   void sendMail({ to: CONTACT_INBOX, subject: `[Edura] ${input.subject}`, ... })
  //     .catch((e) => console.error("[contact] lead notification failed", e));
  // ───────────────────────────────────────────────────────────────────────────
}
