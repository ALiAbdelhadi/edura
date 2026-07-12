import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

// Per-screen namespaces (produced by the i18n rollout). Each file is merged
// into the dictionary under its namespace key; screens use t("<ns>.key").
import adminHomeEn from "@/messages/en/adminHome.json";
import adminManageEn from "@/messages/en/adminManage.json";
import teacherEn from "@/messages/en/teacher.json";
import studentEn from "@/messages/en/student.json";
import studentClassEn from "@/messages/en/studentClass.json";
import parentEn from "@/messages/en/parent.json";
import sharedEn from "@/messages/en/shared.json";
import adminHomeAr from "@/messages/ar/adminHome.json";
import adminManageAr from "@/messages/ar/adminManage.json";
import teacherAr from "@/messages/ar/teacher.json";
import studentAr from "@/messages/ar/student.json";
import studentClassAr from "@/messages/ar/studentClass.json";
import parentAr from "@/messages/ar/parent.json";
import sharedAr from "@/messages/ar/shared.json";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export type Messages = typeof en & Record<string, unknown>;

// adminHome/adminManage/teacher/studentClass/shared use their namespace as a
// key prefix in code (t("teacher.x")) → merge UNDER that key. The student and
// parent files carry per-screen namespaces as their OWN top-level keys
// (t("studentReviews.x"), t("parentLinking.x")) → spread them at top level.
const enMerged = {
  ...en,
  ...studentEn,
  ...parentEn,
  adminHome: adminHomeEn,
  adminManage: adminManageEn,
  teacher: teacherEn,
  studentClass: studentClassEn,
  shared: sharedEn,
} as Messages;

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

/** Deep dot-path getter: t(messages, "nav.students"). Falls back to the key. */
export function translate(messages: Messages, key: string): string {
  const parts = key.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}
