import type { Locale, Role } from "../capture/screens";

/**
 * The flows, declared once and shared by the recorder and the encoder.
 *
 * `posterFraction` is WHERE in the clip the still comes from, as a fraction
 * rather than a number of seconds. That is not a stylistic choice: clip lengths
 * vary with how fast the app responded, and an absolute `2.0s` landed on the
 * sign-in screen for the two recordings that came in under the 8s budget — the
 * poster is the frame a reader stares at before pressing play, and two of them
 * were blank. A fraction near the end always lands after the flow resolves.
 *
 * `maxSeconds` is the brief's ≤8s budget, enforced at encode time by trimming
 * rather than by hoping the recording came in short.
 */
export type FlowKey = "counter-checkin" | "teacher-register" | "student-subjects";

export type FlowSpec = {
  key: FlowKey;
  role: Role;
  /** 0..1 through the trimmed clip. Late, so the flow has resolved. */
  posterFraction: number;
  maxSeconds: number;
  /** One line on what the clip shows, for the alt/caption and ASSETS-TODO. */
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

/**
 * Playwright Test writes each video to
 * `<outputDir>/<specfile>-<test-title-slug>/video.webm`, slugifying the title.
 * The recorder titles its tests `<key> · <locale>` — the middle dot and the
 * spaces both collapse to `-`, so this reproduces the directory name rather
 * than guessing at it.
 */
export function outputSlug(key: FlowKey, locale: Locale): string {
  return `flows-${key}-${locale}`;
}
