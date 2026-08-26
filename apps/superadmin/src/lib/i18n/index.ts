import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

import adminHomeEn from "@/messages/en/admin-home.json";
import adminManageEn from "@/messages/en/admin-manage.json";
import sharedEn from "@/messages/en/shared.json";
import catalogEn from "@/messages/en/catalog.json";
import onboardingEn from "@/messages/en/onboarding.json";
import adminHomeAr from "@/messages/ar/admin-home.json";
import adminManageAr from "@/messages/ar/admin-manage.json";
import sharedAr from "@/messages/ar/shared.json";
import catalogAr from "@/messages/ar/catalog.json";
import onboardingAr from "@/messages/ar/onboarding.json";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

const enMerged = {
  ...en,
  adminHome: adminHomeEn,
  adminManage: adminManageEn,
  shared: sharedEn,
  catalog: catalogEn,
  onboarding: onboardingEn,
};

export type Messages = typeof enMerged;

const arMerged = {
  ...ar,
  adminHome: adminHomeAr,
  adminManage: adminManageAr,
  shared: sharedAr,
  catalog: catalogAr,
  onboarding: onboardingAr,
} as Messages;

const dictionaries: Record<Locale, Messages> = { en: enMerged, ar: arMerged };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
