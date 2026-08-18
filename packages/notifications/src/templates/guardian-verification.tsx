import * as React from "react";
import { normalizeLocale, type Locale } from "../locale";
import type { GuardianVerificationData } from "../types";
import { Cta, EmailLayout, FallbackLink, Note, P } from "./layout";

// =============================================================================
// Guardian email verification.
//
// Goes TO the guardian address itself — that is the entire point: the click is
// what proves the address reaches an adult who accepts the role.
//
// The recipient is NOT a user of this platform and the link signs nobody in.
// It carries a single-use token that can do exactly one thing: mark this
// address confirmed. The copy says so plainly, because an unexplained link
// asking a parent to click is indistinguishable from phishing.
//
// The child's name is included: a guardian who receives this for a child they
// do not know needs to be able to tell, and that is the case worth catching.
// =============================================================================
const COPY = {
  ar: {
    subject: (s: string) => `تأكيد بريد ولي أمر ${s} - Edura`,
    title: "تأكيد بريد ولي الأمر",
    preview: "خطوة واحدة لتأكيد أنك ولي أمر الطالب",
    intro: (s: string) =>
      `تم تسجيل هذا البريد كبريد ولي أمر الطالب ${s} على منصة إدورا. اضغط الزر لتأكيد ذلك.`,
    what: "التأكيد يثبت أن هذا البريد يصل إليك فعلاً. لن يتم تسجيل دخولك، ولن تحصل على أي صلاحية — الرابط لا يفعل شيئًا غير التأكيد.",
    cta: "تأكيد البريد",
    expiry: (d: number) => `الرابط صالح لمدة ${d} يومًا ويُستخدم مرة واحدة.`,
    notYou:
      "لو لم تكن ولي أمر هذا الطالب، تجاهل هذه الرسالة ولا تضغط الرابط — ولا حاجة لأي إجراء منك.",
  },
  en: {
    subject: (s: string) => `Confirm you are ${s}'s guardian - Edura`,
    title: "Confirm guardian email",
    preview: "One step to confirm you are this student's guardian",
    intro: (s: string) =>
      `This address was recorded as the guardian email for ${s} on Edura. Press the button to confirm it.`,
    what: "Confirming proves this address really reaches you. It does not sign you in and grants you no access — the link does nothing except confirm.",
    cta: "Confirm email",
    expiry: (d: number) => `The link is valid for ${d} days and works once.`,
    notYou:
      "If you are not this student's guardian, ignore this message and do not press the link — nothing is required from you.",
  },
} as const;

export function guardianVerificationSubject(
  locale: Locale,
  data: GuardianVerificationData,
): string {
  return COPY[normalizeLocale(locale)].subject(data.studentName);
}

export function GuardianVerificationEmail({
  locale: raw,
  data,
}: {
  locale: Locale;
  data: GuardianVerificationData;
}) {
  const locale = normalizeLocale(raw);
  const t = COPY[locale];
  return (
    <EmailLayout locale={locale} title={t.title} preview={t.preview}>
      <P>{t.intro(data.studentName)}</P>
      <P>{t.what}</P>
      <Cta label={t.cta} href={data.link} locale={locale} />
      <FallbackLink href={data.link} locale={locale} />
      <Note>{t.expiry(data.expiryDays)}</Note>
      <Note>{t.notYou}</Note>
    </EmailLayout>
  );
}

export function guardianVerificationText(
  locale: Locale,
  data: GuardianVerificationData,
): string {
  const t = COPY[normalizeLocale(locale)];
  return [
    t.title,
    "",
    t.intro(data.studentName),
    "",
    t.what,
    "",
    `${t.cta}: ${data.link}`,
    "",
    t.expiry(data.expiryDays),
    t.notYou,
  ].join("\n");
}
