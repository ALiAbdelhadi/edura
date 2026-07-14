import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

import adminHomeEn from "@/messages/en/admin-home.json";
import adminManageEn from "@/messages/en/admin-manage.json";
import teacherEn from "@/messages/en/teacher.json";
import studentEn from "@/messages/en/student.json";
import studentClassEn from "@/messages/en/student-class.json";
import parentEn from "@/messages/en/parent.json";
import sharedEn from "@/messages/en/shared.json";
import adminHomeAr from "@/messages/ar/admin-home.json";
import adminManageAr from "@/messages/ar/admin-manage.json";
import teacherAr from "@/messages/ar/teacher.json";
import studentAr from "@/messages/ar/student.json";
import studentClassAr from "@/messages/ar/student-class.json";
import parentAr from "@/messages/ar/parent.json";
import sharedAr from "@/messages/ar/shared.json";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

// The English catalog is the source of truth for the message SHAPE — its
// precise (non-widened) type drives next-intl's key autocompletion + typecheck.
const enMerged = {
  ...en,
  ...studentEn,
  ...parentEn,
  adminHome: adminHomeEn,
  adminManage: adminManageEn,
  teacher: teacherEn,
  studentClass: studentClassEn,
  shared: sharedEn,
};

export type Messages = typeof enMerged;

// `as Messages` (not `satisfies`) on purpose: the Arabic catalog may lag the
// English one; missing keys fall back to English at request time (request.ts).
const arMerged = {
  ...ar,
  ...studentAr,
  ...parentAr,
  adminHome: adminHomeAr,
  adminManage: adminManageAr,
  teacher: teacherAr,
  studentClass: studentClassAr,
  shared: sharedAr,
} as Messages;

const dictionaries: Record<Locale, Messages> = { en: enMerged, ar: arMerged };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

// NOTE: dot-path lookup (the old custom `translate`) is now handled by
// next-intl's `useTranslations()` / `getTranslations()`. `getMessages` remains
// as the catalog assembler consumed by `src/i18n/request.ts`.
