/**
 * The emulator's world — a complete, fake student life.
 *
 * WHY THIS EXISTS AT ALL: a real first-time student has NO data. Empty
 * schedule, zero wallet, no subjects, no card. A guided tour of the real
 * screens would be a tour of empty states, which teaches nothing and reads as
 * a broken product. So the emulator ships its own populated world and the
 * student practises inside it.
 *
 * NOTHING HERE IS EVER SENT ANYWHERE. No fetch, no mutation, no money. The
 * emulator is a pure client-side simulation, and that is the property that
 * makes it safe to hand a minor a "pay" button and let them press it.
 *
 * Money is in PIASTERS, like the real ledger, so the same <Money> component
 * renders it and the figures practised here match the real ones.
 */

import type { Locale } from "@/lib/i18n";

/** Every visible string in the world carries both scripts. */
export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuSession = { id: string; subject: Bi; time: string; day?: Bi };
export type EmuGroup = {
  id: string;
  teacher: Bi;
  days: Bi;
  time: string;
  center: Bi;
  seats: string;
  full?: boolean;
  pricePerMonth: number;
  pricePerSession: number;
};
export type EmuSubject = { id: string; name: Bi; groups: EmuGroup[] };
export type EmuLedgerRow = {
  id: string;
  date: string;
  kind: "topup" | "payment";
  ref: string;
  amount: number;
  balance: number;
};

/** The student the learner plays as. A person, not "Student 1". */
export const EMU_STUDENT = {
  name: { ar: "نور محمود", en: "Nour Mahmoud" },
  code: "G7K3M2QF",
  grade: { ar: "الصف الثالث الثانوي", en: "Secondary 3" },
  track: { ar: "علمي علوم", en: "Science" },
  system: { ar: "التعليم العام", en: "General" },
} satisfies Record<string, Bi | string>;

const CHEM: Bi = { ar: "الكيمياء", en: "Chemistry" };
const PHYS: Bi = { ar: "الفيزياء", en: "Physics" };
const MATH: Bi = { ar: "الرياضيات", en: "Maths" };
const GRADE: Bi = { ar: "الثالث الثانوي", en: "Secondary 3" };

const titled = (s: Bi): Bi => ({ ar: `${s.ar} — ${GRADE.ar}`, en: `${s.en} — ${GRADE.en}` });

export const EMU_TODAY: EmuSession[] = [{ id: "s1", subject: titled(CHEM), time: "16:00" }];

/**
 * Where the lesson is and who teaches it.
 *
 * The real home leads with هذين beside the time — "عندي حصة النهاردة؟ امتى
 * وفين؟" is one question with three parts, and a rehearsal that answers only
 * "امتى" teaches a screen that no longer exists.
 */
export const EMU_PLACE = {
  room: { ar: "قاعة ٣", en: "Hall 3" },
  teacher: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
} satisfies Record<string, Bi>;

/**
 * How long the cover lasts, once the learner has subscribed.
 *
 * A monthly plan is manual-renewal with no reminder job behind it, so knowing
 * where the end date is written is a thing worth rehearsing rather than
 * discovering at a counter.
 */
export const EMU_COVER = { daysLeft: 26 } as const;

export const EMU_WEEK: EmuSession[] = [
  { id: "s2", subject: titled(PHYS), time: "16:00", day: { ar: "الأحد", en: "Sun" } },
  { id: "s3", subject: titled(CHEM), time: "18:00", day: { ar: "الاثنين", en: "Mon" } },
];

/** Subjects on the practice screen. One group is deliberately FULL, so the
 *  learner meets that state here rather than for the first time in the real app. */
export const EMU_SUBJECTS: EmuSubject[] = [
  {
    id: "chem",
    name: CHEM,
    groups: [
      {
        id: "g1",
        teacher: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
        days: { ar: "الأحد · الثلاثاء", en: "Sun · Tue" },
        time: "16:00 – 17:30",
        center: { ar: "سنتر النيل", en: "Nile Centre" },
        seats: "18/25",
        pricePerMonth: 40000,
        pricePerSession: 12000,
      },
      {
        id: "g2",
        teacher: { ar: "أ. منى صابر", en: "Ms Mona Saber" },
        days: { ar: "الاثنين · الخميس", en: "Mon · Thu" },
        time: "18:00 – 19:30",
        center: { ar: "سنتر النيل", en: "Nile Centre" },
        seats: "25/25",
        full: true,
        pricePerMonth: 45000,
        pricePerSession: 13000,
      },
    ],
  },
  {
    id: "math",
    name: MATH,
    groups: [
      {
        id: "g3",
        teacher: { ar: "أ. كريم فؤاد", en: "Mr Karim Fouad" },
        days: { ar: "السبت · الأربعاء", en: "Sat · Wed" },
        time: "15:00 – 16:30",
        center: { ar: "سنتر الأندلس", en: "Andalus Centre" },
        seats: "9/20",
        pricePerMonth: 38000,
        pricePerSession: 11000,
      },
    ],
  },
];

/** Opening wallet state. The emulator mutates a COPY of this in React state. */
export const EMU_WALLET_OPENING = 15000;

export const EMU_LEDGER_OPENING: EmuLedgerRow[] = [
  { id: "l1", date: "٠١/٠٨", kind: "topup", ref: "TRX-0431", amount: 15000, balance: 15000 },
];

/** The record tiles on the practice dashboard. */
export const EMU_RECORD = { attendanceRate: 92, averagePercent: 88 } as const;
