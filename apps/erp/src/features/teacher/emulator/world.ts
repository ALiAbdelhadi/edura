/**
 * The teacher emulator's world — a complete, fake teaching day.
 *
 * WHY THIS EXISTS AT ALL: a real first-day teacher has NO data. No centre, no
 * class, no students, no lesson, an empty wallet. A guided tour of the real
 * screens would be a tour of empty states — it would teach nothing and read as
 * a broken product. So the emulator ships its own populated day and the teacher
 * practises inside it. Same reasoning as the student emulator's world.
 *
 * NOTHING HERE IS EVER SENT ANYWHERE. No fetch, no mutation, no ledger row, no
 * money. Every figure below is React state in `teacher-emulator.tsx`. That is
 * the property that makes it safe to hand a first-timer a button that says
 * "close the lesson and distribute EGP 360" and let them press it.
 *
 * Money is in PIASTERS, like the real ledger, so the same <Money> component
 * renders it and the figures practised here read exactly like the real ones.
 *
 * THE SPLIT NUMBERS ARE ILLUSTRATIVE, AND THE UI SAYS SO. The real platform
 * share and hall share are configuration a centre and the platform own; this
 * world picks one plausible set so the arithmetic on screen adds up. It must
 * never be read as a published rate — `sandboxNote` carries that in words.
 */

import type { Locale } from "@/lib/i18n";

/** Every visible string in the world carries both scripts. */
export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuAttendance = "present" | "absent" | "excused" | "counter_only";

export type EmuPupil = {
  id: string;
  name: Bi;
  /** Where they start the lesson. `counter_only` is the state the whole
   *  attendance mission exists to teach, so the roster ships one. */
  status: EmuAttendance;
};

export type EmuLesson = {
  id: string;
  date: Bi;
  time: string;
  /** A finished lesson the teacher already closed — so "already distributed"
   *  is a state they meet here, not for the first time on real money. */
  settled?: boolean;
};

export type EmuWalletRow = {
  id: string;
  date: string;
  kind: "payment" | "payout";
  ref: string;
  amount: number;
};

export type EmuPayoutRow = {
  id: string;
  amount: number;
  status: "pending";
  requested: string;
};

/** The teacher the learner plays as. A person, not "Teacher 1". */
export const EMU_TEACHER = {
  name: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
  subject: { ar: "الكيمياء", en: "Chemistry" },
  grade: { ar: "الثالث الثانوي", en: "Secondary 3" },
  centre: { ar: "سنتر النيل", en: "Nile Centre" },
  room: { ar: "قاعة ٢", en: "Hall 2" },
} satisfies Record<string, Bi>;

/** The one class the practice day revolves around. It starts UNPRICED, which is
 *  the single most common thing that blocks a real teacher's first payout. */
export const EMU_CLASS = {
  id: "c1",
  title: { ar: "الكيمياء — الثالث الثانوي", en: "Chemistry — Secondary 3" },
  days: { ar: "الأحد · الثلاثاء", en: "Sun · Tue" },
  time: "16:00 – 17:30",
} as const;

/** The price the pricing mission sets: 120 EGP a lesson. */
export const EMU_SESSION_PRICE = 12000;

/** How the lesson price splits, per attending student. Teacher = the REMAINDER,
 *  exactly as the real engine derives it — so the three figures on screen can
 *  never fail to sum to the price. */
export const EMU_SPLIT = {
  platform: 1800,
  centre: 3000,
  get teacher() {
    return EMU_SESSION_PRICE - this.platform - this.centre;
  },
} as const;

export const EMU_TODAY_LESSON: EmuLesson = {
  id: "s1",
  date: { ar: "اليوم", en: "Today" },
  time: "16:00 – 17:30",
};

export const EMU_LESSONS: EmuLesson[] = [
  EMU_TODAY_LESSON,
  { id: "s0", date: { ar: "الثلاثاء الماضي", en: "Last Tue" }, time: "16:00 – 17:30", settled: true },
];

/** Six children: four straightforward, one absent to mark, and one sitting on
 *  `counter_only` — the state that silently costs a teacher money. */
export const EMU_ROSTER: EmuPupil[] = [
  { id: "p1", name: { ar: "نور محمود", en: "Nour Mahmoud" }, status: "present" },
  { id: "p2", name: { ar: "يوسف عبد الله", en: "Youssef Abdullah" }, status: "present" },
  { id: "p3", name: { ar: "سلمى رفعت", en: "Salma Refaat" }, status: "present" },
  { id: "p4", name: { ar: "عمر الشريف", en: "Omar El Sherif" }, status: "present" },
  { id: "p5", name: { ar: "مريم فتحي", en: "Mariam Fathy" }, status: "counter_only" },
  { id: "p6", name: { ar: "كريم فؤاد", en: "Karim Fouad" }, status: "present" },
];

/** Opening wallet. Small and non-round on purpose: a wallet that starts at zero
 *  makes the settlement's effect invisible, and one that starts round reads as
 *  a placeholder. */
export const EMU_WALLET_OPENING = 25000;

export const EMU_WALLET_OPENING_ROWS: EmuWalletRow[] = [
  { id: "w1", date: "٠٣/٠٨", kind: "payment", ref: "TRX-0512", amount: 25000 },
];

/** The dashboard's four figures. `pendingGrades` is deliberately non-zero: it is
 *  the one number parents experience as lateness, and the tour points at it. */
export const EMU_DASHBOARD = {
  classesToday: 1,
  pendingGrades: 2,
  totalStudents: EMU_ROSTER.length,
  attendancePercent: 92,
} as const;
