import type { Locale } from "@/lib/i18n";

export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuCounterStudent = {
  id: string;
  name: Bi;
  code: string;
  covered: boolean;
  checkedIn: boolean;
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

export const EMU_LESSON = {
  id: "s1",
  time: "16:00 – 17:30",
  live: true,
} as const;

export const EMU_SESSION_PRICE = 12000;

export const EMU_SPLIT = {
  platform: 1800,
  centre: 3000,
  get teacher() {
    return EMU_SESSION_PRICE - this.platform - this.centre;
  },
} as const;

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

export const EMU_DASHBOARD = {
  totalStudents: 5,
  activeClasses: 1,
  attendancePercent: 88,
  pendingActions: 2,
} as const;
