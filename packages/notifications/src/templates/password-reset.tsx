import * as React from "react";
import { normalizeLocale, type Locale } from "../locale";
import type { PasswordResetData } from "../types";
import { Cta, EmailLayout, FallbackLink, Note, P } from "./layout";

// Copy carried over verbatim from @repo/server-core/mail/templates.ts, which
// now re-exports this renderer. The one substantive change: the validity window
// is a parameter instead of a hardcoded "1 hour", so the email can never claim
// a TTL the token service disagrees with.
const COPY = {
  ar: {
    subject: "إعادة تعيين كلمة المرور - Edura",
    title: "إعادة تعيين كلمة المرور",
    preview: "رابط إعادة تعيين كلمة المرور الخاصة بك",
    intro: "تلقّينا طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك على Edura.",
    action: (h: number) =>
      `اضغط على الزر التالي لتعيين كلمة مرور جديدة. الرابط صالح لمدة ${h === 1 ? "ساعة واحدة" : `${h} ساعات`} فقط.`,
    cta: "إعادة تعيين كلمة المرور",
    ignore:
      "إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة — لن يتغيّر أي شيء في حسابك.",
  },
  en: {
    subject: "Reset your Edura password",
    title: "Reset your password",
    preview: "Your Edura password reset link",
    intro: "We received a request to reset the password for your Edura account.",
    action: (h: number) =>
      `Click the button below to set a new password. This link is valid for ${h} hour${h === 1 ? "" : "s"} only.`,
    cta: "Reset password",
    ignore: "If you didn't request a password reset, ignore this email — nothing will change.",
  },
} as const;

export function passwordResetSubject(locale: Locale): string {
  return COPY[locale].subject;
}

export function PasswordResetEmail({
  locale: raw,
  data,
}: {
  locale: Locale;
  data: PasswordResetData;
}) {
  const locale = normalizeLocale(raw);
  const t = COPY[locale];

  // Order matters: instruction → BUTTON → fallback link → ignore note. The
  // primary action has to sit directly under the sentence that asks for it,
  // not below the small print.
  return (
    <EmailLayout locale={locale} title={t.title} preview={t.preview}>
      <P>{t.intro}</P>
      <P>{t.action(data.expiryHours)}</P>
      <Cta label={t.cta} href={data.link} locale={locale} />
      <FallbackLink href={data.link} locale={locale} />
      <Note>{t.ignore}</Note>
    </EmailLayout>
  );
}

export function passwordResetText(locale: Locale, data: PasswordResetData): string {
  const t = COPY[locale];
  return [t.title, "", t.intro, t.action(data.expiryHours), "", data.link, "", t.ignore].join("\n");
}
