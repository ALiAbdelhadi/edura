import type { Locale, Role } from "../capture/screens";

export type FlowKey = "counter-checkin" | "teacher-register" | "student-subjects";

export type FlowSpec = {
  key: FlowKey;
  role: Role;
  posterFraction: number;
  maxSeconds: number;
  caption: { ar: string; en: string };
};

export const FLOWS: FlowSpec[] = [
  {
    key: "counter-checkin",
    role: "staff",
    posterFraction: 0.88,
    maxSeconds: 8,
    caption: {
      ar: "موظف الاستقبال يكتب كود الطالب ويلاقيه في ثانية.",
      en: "The front desk types a student code and finds them in seconds.",
    },
  },
  {
    key: "teacher-register",
    role: "teacher",
    posterFraction: 0.85,
    maxSeconds: 8,
    caption: {
      ar: "المدرّس يفتح كشف الحضور للحصة.",
      en: "A teacher opens the register for a lesson.",
    },
  },
  {
    key: "student-subjects",
    role: "student",
    posterFraction: 0.85,
    maxSeconds: 8,
    caption: {
      ar: "مواد الطالب محددة تلقائيًا من شعبته.",
      en: "A student's subjects, assigned automatically from their track.",
    },
  },
];

export const FLOW_LOCALES: Locale[] = ["ar", "en"];

export function outputSlug(key: FlowKey, locale: Locale): string {
  return `flows-${key}-${locale}`;
}
