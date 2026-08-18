/**
 * The centre emulator's world — a complete, fake counter day.
 *
 * WHY THIS EXISTS AT ALL: a real first-day centre has NO data. No teacher, no
 * hall, no class, no student, an empty ledger. A guided tour of the real screens
 * would be a tour of empty states. So the emulator ships its own populated day
 * and the owner practises inside it. Same reasoning as the student and teacher
 * worlds — one pattern, three roles.
 *
 * NOTHING HERE IS EVER SENT ANYWHERE. No fetch, no mutation, no receipt, no
 * ledger row. Every figure is React state in `center-emulator.tsx`. That is what
 * makes it safe to hand a stranger a button reading "collect EGP 120 in cash and
 * check the student in" and let them press it.
 *
 * Money is in PIASTERS, like the real ledger, so the same <Money> component
 * renders it and the figures practised here read exactly like the real ones.
 *
 * THE SPLIT NUMBERS ARE ILLUSTRATIVE, AND THE UI SAYS SO — see the teacher
 * world for the same note. What is NOT illustrative is their arithmetic: the
 * teacher's share is derived as the remainder, so the three shares on screen
 * always sum to the lesson price, exactly as the real engine derives them.
 */

import type { Locale } from "@/lib/i18n";

/** Every visible string in the world carries both scripts. */
export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

/** What the counter knows about a student standing in front of it. */
export type EmuCounterStudent = {
  id: string;
  name: Bi;
  code: string;
  /** Has this lesson already been paid for? */
  covered: boolean;
  /** Checked in at the counter for this lesson? */
  checkedIn: boolean;
  /** On the group's roster, or a walk-in the search found. */
  onRoster: boolean;
};

export type EmuReceipt = {
  id: string;
  no: string;
  student: Bi;
  amount: number;
  kind: "payment" | "refund";
};

export const EMU_CENTRE = {
  name: { ar: "سنتر النيل", en: "Nile Centre" },
  room: { ar: "قاعة ٢", en: "Hall 2" },
  teacher: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
} satisfies Record<string, Bi>;

export const EMU_CLASS = {
  id: "c1",
  title: { ar: "الكيمياء — الثالث الثانوي", en: "Chemistry — Secondary 3" },
  days: { ar: "الأحد · الثلاثاء", en: "Sun · Tue" },
  time: "16:00 – 17:30",
} as const;

/** The lesson the counter is working. It is LIVE, because that is the only
 *  state a receptionist ever opens this screen in. */
export const EMU_LESSON = {
  id: "s1",
  time: "16:00 – 17:30",
  live: true,
} as const;

/** 120 EGP a lesson — what the pricing mission sets, and what the counter then
 *  collects. The two numbers are the same on purpose: an operator who prices in
 *  one screen and collects a different figure in another has learned nothing. */
export const EMU_SESSION_PRICE = 12000;

export const EMU_SPLIT = {
  platform: 1800,
  centre: 3000,
  get teacher() {
    return EMU_SESSION_PRICE - this.platform - this.centre;
  },
} as const;

/**
 * Five students, chosen so every state the counter meets is on screen at once:
 * two already paid and checked in, one paid but not yet checked in, one who has
 * NOT paid (the cash the tour collects), and one who is not on the roster at all
 * — the walk-in that the real screen finds by search and the fake one would
 * quietly hide.
 */
export const EMU_ROSTER: EmuCounterStudent[] = [
  {
    id: "p1",
    name: { ar: "نور محمود", en: "Nour Mahmoud" },
    code: "G7K3M2QF",
    covered: true,
    checkedIn: true,
    onRoster: true,
  },
  {
    id: "p2",
    name: { ar: "يوسف عبد الله", en: "Youssef Abdullah" },
    code: "G4B9NT21",
    covered: true,
    checkedIn: true,
    onRoster: true,
  },
  {
    id: "p3",
    name: { ar: "سلمى رفعت", en: "Salma Refaat" },
    code: "GQ2M7V8H",
    covered: true,
    checkedIn: false,
    onRoster: true,
  },
  {
    id: "p4",
    name: { ar: "مريم فتحي", en: "Mariam Fathy" },
    code: "G6XC1PR4",
    covered: false,
    checkedIn: false,
    onRoster: true,
  },
  {
    id: "p5",
    name: { ar: "عمر الشريف", en: "Omar El Sherif" },
    code: "GH5T9WK3",
    covered: false,
    checkedIn: false,
    onRoster: false,
  },
];

/** Opening books. Small and non-round: a ledger that starts at zero makes the
 *  collected cash invisible, and a round one reads as a placeholder. */
export const EMU_REVENUE_OPENING = 84000;
export const EMU_EXPENSES = 32000;

export const EMU_RECEIPTS_OPENING: EmuReceipt[] = [
  {
    id: "r1",
    no: "RCP-NILE-2026-00014",
    student: { ar: "نور محمود", en: "Nour Mahmoud" },
    amount: 12000,
    kind: "payment",
  },
  {
    id: "r2",
    no: "RCP-NILE-2026-00015",
    student: { ar: "يوسف عبد الله", en: "Youssef Abdullah" },
    amount: 12000,
    kind: "payment",
  },
];

/** The overview's figures. `pendingActions` is non-zero on purpose: it is the
 *  centre's own backlog, and the tour points at it rather than at a clean slate. */
export const EMU_DASHBOARD = {
  totalStudents: 5,
  activeClasses: 1,
  attendancePercent: 88,
  pendingActions: 2,
} as const;
