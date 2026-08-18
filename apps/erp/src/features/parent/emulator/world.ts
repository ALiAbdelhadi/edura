/**
 * The parent emulator's world — a complete, fake family.
 *
 * WHY THIS EXISTS AT ALL: a parent's real account on day one has NO linked
 * child, so every screen in their portal is an empty state — no progress, no
 * attendance, nothing to pay for, no conversations to oversee. A guided tour of
 * those screens would teach nothing. So the emulator ships a family and the
 * parent practises on it.
 *
 * NOTHING HERE IS EVER SENT ANYWHERE. No fetch, no mutation, no money, no
 * writes. That is what makes it safe to hand someone a button reading
 * «ادفع من محفظتي» and let them press it.
 *
 * Money is in PIASTERS, like the real ledger, so the same <Money> component
 * renders it and the figures practised here match the real ones.
 *
 * THE OPENING BALANCE IS DELIBERATELY SHORT of the lesson price. The parent
 * tops up before paying, in that order, because that is the order the real
 * product forces and the one a parent otherwise discovers at the till.
 */

import type { Locale } from "@/lib/i18n";

/** Every visible string in the world carries both scripts. */
export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuChild = {
  id: string;
  name: Bi;
  grade: Bi;
  /** Under 18 — which is what makes oversight available for them at all. */
  minor: boolean;
  attendanceRate: number;
  averagePercent: number;
};

export type EmuLesson = {
  id: string;
  teacher: Bi;
  when: Bi;
  center: Bi;
  pricePerSession: number;
  pricePerMonth: number;
};

export type EmuWalletRow = {
  id: string;
  /** A plain string, not a `Bi`: a numeric date reads the same in both scripts
   *  and `<Num>` isolates it, so it needs no translation. */
  date: string;
  kind: "topup" | "payment";
  /** WHICH child a spend was for — the column a parent ledger has and a
   *  student ledger does not, and the reason this screen is worth practising. */
  child: Bi | null;
  amount: number;
  balance: number;
};

export const EMU_PARENT = { name: { ar: "أحمد محمود", en: "Ahmed Mahmoud" } } as const;

export const EMU_CHILDREN: EmuChild[] = [
  {
    id: "c1",
    name: { ar: "نور محمود", en: "Nour Mahmoud" },
    grade: { ar: "الصف الثالث الثانوي", en: "Secondary 3" },
    minor: true,
    attendanceRate: 92,
    averagePercent: 88,
  },
  {
    id: "c2",
    name: { ar: "يوسف محمود", en: "Youssef Mahmoud" },
    grade: { ar: "الصف الأول الإعدادي", en: "Preparatory 1" },
    minor: true,
    attendanceRate: 78,
    averagePercent: 71,
  },
];

export const EMU_SUBJECT: Bi = { ar: "الكيمياء", en: "Chemistry" };

export const EMU_LESSON: EmuLesson = {
  id: "g1",
  teacher: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
  when: { ar: "الأحد · الثلاثاء · 16:00", en: "Sun · Tue · 16:00" },
  center: { ar: "سنتر النيل", en: "Nile Centre" },
  pricePerSession: 12000,
  pricePerMonth: 40000,
};

/** Short of `EMU_LESSON.pricePerSession` on purpose — see the file header. */
export const EMU_WALLET_OPENING = 5000;

export const EMU_WALLET_OPENING_ROWS: EmuWalletRow[] = [
  {
    id: "w1",
    date: "02/08",
    kind: "topup",
    child: null,
    amount: 5000,
    balance: 5000,
  },
];

/** One thread on the oversight screen — with an ADULT, which is the only kind
 *  a parent may see. A child's chat with another student never appears here. */
export const EMU_THREAD = {
  with: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
  role: { ar: "مدرّس", en: "Teacher" },
  messages: [
    {
      id: "m1",
      fromChild: false,
      text: { ar: "واجب النهارده صفحة ٤٢ لو سمحت.", en: "Today's homework is page 42, please." },
      at: "16:40",
    },
    {
      id: "m2",
      fromChild: true,
      text: { ar: "تمام يا مستر، شكرًا.", en: "Okay sir, thank you." },
      at: "16:44",
    },
  ],
} as const;
