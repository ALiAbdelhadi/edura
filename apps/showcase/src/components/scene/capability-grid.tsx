"use client";

import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n";

/**
 * The assistant delegation boundary, drawn as TWO LISTS rather than one grid
 * with greyed-out rows.
 *
 * CONSTITUTION.md §7: "Excluded capabilities are absent, not disabled. A
 * disabled control teaches that the capability exists and is being withheld."
 * That rule governs the PRODUCT's screens — an assistant never sees a greyed
 * wallet button. Here on a marketing page the exclusion is the message, so it
 * is stated as its own column with its own heading, rather than smuggled in as
 * a row the reader has to notice is dimmed.
 *
 * Every entry is a real capability from `authz/acting-teacher.ts` and the Step 8
 * delegation decision — nothing is here for symmetry.
 */
const CAN = {
  ar: ["الحضور والتحضير", "تشيك-إن باب القاعة", "الدرجات", "المواد", "الجداول", "طلبات التعاون", "ملاحظات الفريق"],
  en: [
    "Attendance",
    "Door check-in",
    "Grades",
    "Materials",
    "Schedules",
    "Collaboration requests",
    "Team notes",
  ],
} as const;

const CANNOT = {
  ar: ["المحفظة", "المسحوبات", "الإعدادات المالية", "إدارة المساعدين"],
  en: ["The wallet", "Payouts", "Financial settings", "Managing other assistants"],
} as const;

export function CapabilityGrid() {
  const locale = useLocale() as Locale;
  const can = CAN[locale] ?? CAN.en;
  const cannot = CANNOT[locale] ?? CANNOT.en;

  return (
    <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
      <div
        className="rounded-[var(--radius-step-lg)] border p-6"
        style={{ borderColor: "var(--rule)", backgroundColor: "var(--sheet)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>
          {locale === "ar" ? "المساعد يقدر" : "An assistant can"}
        </p>
        <ul className="mt-4 grid gap-2">
          {can.map((item) => (
            <li key={item} className="text-sm" style={{ color: "var(--ink)" }}>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="rounded-[var(--radius-step-lg)] border p-6"
        style={{ borderColor: "var(--rule)", backgroundColor: "var(--sheet)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--red)" }}>
          {locale === "ar" ? "وعمره ما يقدر" : "And never can"}
        </p>
        <ul className="mt-4 grid gap-2">
          {cannot.map((item) => (
            <li key={item} className="text-sm" style={{ color: "var(--ink)" }}>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {locale === "ar"
            ? "وكل عملية بيعملها متسجّلة باسمه هو، نيابة عن المدرّس — مش باسم المدرّس."
            : "And every action he takes is recorded as his, on the teacher's behalf — never as the teacher."}
        </p>
      </div>
    </div>
  );
}
