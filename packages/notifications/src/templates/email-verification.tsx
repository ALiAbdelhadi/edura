import * as React from "react";
import { normalizeLocale, type Locale } from "../locale";
import type { EmailVerificationData } from "../types";
import { Cta, EmailLayout, FallbackLink, Note, P } from "./layout";

// =============================================================================
// Confirm-by-click address verification.
//
// This is the template the guardian-email work explicitly left unbuilt (see
// CLAUDE.md "Guardian email is stored, NOT verified"): a student can type a
// friend's address and today nothing checks it. The RENDERER lives here now so
// that work is a service away, not a design away. No flow sends it yet — wiring
// it is a decision about what happens to an unverified address, which is a
// product rule, not a template.
// =============================================================================
const COPY = {
  ar: {
    subject: "تأكيد بريدك الإلكتروني - Edura",
    title: "تأكيد البريد الإلكتروني",
    preview: "أكّد بريدك الإلكتروني على Edura",
    intro: "استخدم الزر التالي لتأكيد أن هذا البريد الإلكتروني يخصك فعلاً.",
    action: (h: number) =>
      `الرابط صالح لمدة ${h === 1 ? "ساعة واحدة" : `${h} ساعات`}. بعد التأكيد يمكننا إرسال الإشعارات المهمة إليك.`,
    cta: "تأكيد البريد الإلكتروني",
    ignore:
      "إذا لم تطلب هذا التأكيد، تجاهل الرسالة — لن يُضاف بريدك إلى أي حساب.",
  },
  en: {
    subject: "Confirm your email address - Edura",
    title: "Confirm your email",
    preview: "Confirm your Edura email address",
    intro: "Use the button below to confirm that this email address is really yours.",
    action: (h: number) =>
      `The link is valid for ${h} hour${h === 1 ? "" : "s"}. Once confirmed we can send you important notifications.`,
    cta: "Confirm email",
    ignore:
      "If you didn't request this, ignore the message — your address will not be added to any account.",
  },
} as const;

export function emailVerificationSubject(locale: Locale): string {
  return COPY[locale].subject;
}

export function EmailVerificationEmail({
  locale: raw,
  data,
}: {
  locale: Locale;
  data: EmailVerificationData;
}) {
  const locale = normalizeLocale(raw);
  const t = COPY[locale];

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

export function emailVerificationText(locale: Locale, data: EmailVerificationData): string {
  const t = COPY[locale];
  return [t.title, "", t.intro, t.action(data.expiryHours), "", data.link, "", t.ignore].join("\n");
}
