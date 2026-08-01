import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

import adminHomeEn from "@/messages/en/admin-home.json";
import adminManageEn from "@/messages/en/admin-manage.json";
import teacherEn from "@/messages/en/teacher.json";
import studentEn from "@/messages/en/student.json";
import studentClassEn from "@/messages/en/student-class.json";
import parentEn from "@/messages/en/parent.json";
import sharedEn from "@/messages/en/shared.json";
import catalogEn from "@/messages/en/catalog.json";
import onboardingEn from "@/messages/en/onboarding.json";
import landingEn from "@/messages/en/landing.json";
import adminHomeAr from "@/messages/ar/admin-home.json";
import adminManageAr from "@/messages/ar/admin-manage.json";
import teacherAr from "@/messages/ar/teacher.json";
import studentAr from "@/messages/ar/student.json";
import studentClassAr from "@/messages/ar/student-class.json";
import parentAr from "@/messages/ar/parent.json";
import sharedAr from "@/messages/ar/shared.json";
import catalogAr from "@/messages/ar/catalog.json";
import onboardingAr from "@/messages/ar/onboarding.json";
import landingAr from "@/messages/ar/landing.json";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

const enMerged = {
  ...en,
  ...studentEn,
  ...parentEn,
  adminHome: adminHomeEn,
  adminManage: adminManageEn,
  teacher: teacherEn,
  studentClass: studentClassEn,
  shared: sharedEn,
  catalog: catalogEn,
  onboarding: onboardingEn,
  landing: landingEn,
};

export type Messages = typeof enMerged;

const arMerged = {
  ...ar,
  ...studentAr,
  ...parentAr,
  adminHome: adminHomeAr,
  adminManage: adminManageAr,
  teacher: teacherAr,
  studentClass: studentClassAr,
  shared: sharedAr,
  catalog: catalogAr,
  onboarding: onboardingAr,
  landing: landingAr,
} as Messages;

const dictionaries: Record<Locale, Messages> = { en: enMerged, ar: arMerged };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
