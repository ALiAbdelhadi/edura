import * as React from "react";
import { normalizeLocale, type Locale } from "../locale";
import type { EmailChangeConfirmData, EmailChangeNoticeData } from "../types";
import { Cta, EmailLayout, FallbackLink, Note, P } from "./layout";

// SECURITY_AUDIT.md M-06 — two mails per login-email change: the NEW address
// proves it is reachable and wanted; the OLD address learns a change was asked
// for, so a stolen session cannot quietly move the account somewhere else.

const CONFIRM = {
  ar: {
    subject: "تأكيد بريدك الجديد - Edura",
    title: "تأكيد البريد الإلكتروني الجديد",
    preview: "أكّد بريدك الجديد لتسجيل الدخول إلى Edura",
    intro: (e: string) => `طُلب تغيير بريد تسجيل الدخول لحسابك على Edura إلى ${e}.`,
    action: (h: number) =>
      `اضغط على الزر التالي لتأكيد أن هذا البريد يخصك. الرابط صالح لمدة ${h === 1 ? "ساعة واحدة" : `${h} ساعات`}، ولن يتغيّر أي شيء قبل التأكيد.`,
    cta: "تأكيد البريد الجديد",
    ignore: "إذا لم تطلب هذا التغيير، تجاهل الرسالة — سيبقى بريدك الحالي كما هو.",
  },
  en: {
    subject: "Confirm your new Edura email",
    title: "Confirm your new email",
    preview: "Confirm the new login email for your Edura account",
    intro: (e: string) => `A request was made to change the login email of your Edura account to ${e}.`,
    action: (h: number) =>
      `Click the button below to confirm this address is yours. The link is valid for ${h} hour${h === 1 ? "" : "s"}; nothing changes until you confirm.`,
    cta: "Confirm new email",
    ignore: "If you did not ask for this, ignore this message — your current email stays as it is.",
  },
} as const;

const NOTICE = {
  ar: {
    subject: "طلب تغيير بريد تسجيل الدخول - Edura",
    title: "طُلب تغيير بريد تسجيل الدخول",
    preview: "تنبيه أمني: طُلب تغيير بريد حسابك",
    intro: (m: string) => `طُلب تغيير بريد تسجيل الدخول لحسابك على Edura إلى عنوان ينتهي بـ ${m}.`,
    body: "لن يتغيّر أي شيء حتى يُؤكَّد العنوان الجديد من بريده. إذا كنت أنت من طلب ذلك فلا حاجة لأي إجراء.",
    warn: "إذا لم تطلب هذا التغيير، غيّر كلمة المرور فورًا من إعدادات الحساب — تغييرها يُنهي كل الجلسات المفتوحة ويُبطل طلب التغيير.",
  },
  en: {
    subject: "Login email change requested - Edura",
    title: "A login email change was requested",
    preview: "Security notice: a change to your account email was requested",
    intro: (m: string) => `A request was made to change the login email of your Edura account to an address ending in ${m}.`,
    body: "Nothing changes until the new address confirms from its own inbox. If this was you, no action is needed.",
    warn: "If you did not request this, change your password now from account settings — that signs out every open session and voids the request.",
  },
} as const;

export function emailChangeConfirmSubject(locale: Locale): string {
  return CONFIRM[locale].subject;
}
export function EmailChangeConfirmEmail({ locale: raw, data }: { locale: Locale; data: EmailChangeConfirmData }) {
  const locale = normalizeLocale(raw);
  const t = CONFIRM[locale];
  return (
    <EmailLayout locale={locale} title={t.title} preview={t.preview}>
      <P>{t.intro(data.newEmail)}</P>
      <P>{t.action(data.expiryHours)}</P>
      <Cta label={t.cta} href={data.link} locale={locale} />
      <FallbackLink href={data.link} locale={locale} />
      <Note>{t.ignore}</Note>
    </EmailLayout>
  );
}
export function emailChangeConfirmText(locale: Locale, data: EmailChangeConfirmData): string {
  const t = CONFIRM[locale];
  return [t.title, "", t.intro(data.newEmail), t.action(data.expiryHours), "", data.link, "", t.ignore].join("\n");
}

export function emailChangeNoticeSubject(locale: Locale): string {
  return NOTICE[locale].subject;
}
export function EmailChangeNoticeEmail({ locale: raw, data }: { locale: Locale; data: EmailChangeNoticeData }) {
  const locale = normalizeLocale(raw);
  const t = NOTICE[locale];
  return (
    <EmailLayout locale={locale} title={t.title} preview={t.preview}>
      <P>{t.intro(data.newEmailMasked)}</P>
      <P>{t.body}</P>
      <Note>{t.warn}</Note>
    </EmailLayout>
  );
}
export function emailChangeNoticeText(locale: Locale, data: EmailChangeNoticeData): string {
  const t = NOTICE[locale];
  return [t.title, "", t.intro(data.newEmailMasked), t.body, "", t.warn].join("\n");
}
