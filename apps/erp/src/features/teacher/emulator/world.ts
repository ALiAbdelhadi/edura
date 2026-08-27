import type { Locale } from "@/lib/i18n";

export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuAttendance = "present" | "absent" | "excused" | "counter_only";

export type EmuPupil = {
  id: string;
  name: Bi;
  status: EmuAttendance;
};

export type EmuLesson = {
  id: string;
  date: Bi;
  time: string;
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

export const EMU_TEACHER = {
  name: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
  subject: { ar: "الكيمياء", en: "Chemistry" },
  grade: { ar: "الثالث الثانوي", en: "Secondary 3" },
  centre: { ar: "سنتر النيل", en: "Nile Centre" },
  room: { ar: "قاعة ٢", en: "Hall 2" },
} satisfies Record<string, Bi>;

export const EMU_CLASS = {
  id: "c1",
  title: { ar: "الكيمياء — الثالث الثانوي", en: "Chemistry — Secondary 3" },
  days: { ar: "الأحد · الثلاثاء", en: "Sun · Tue" },
  time: "16:00 – 17:30",
} as const;

export const EMU_SESSION_PRICE = 12000;

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

export const EMU_ROSTER: EmuPupil[] = [
  { id: "p1", name: { ar: "نور محمود", en: "Nour Mahmoud" }, status: "present" },
  { id: "p2", name: { ar: "يوسف عبد الله", en: "Youssef Abdullah" }, status: "present" },
  { id: "p3", name: { ar: "سلمى رفعت", en: "Salma Refaat" }, status: "present" },
  { id: "p4", name: { ar: "عمر الشريف", en: "Omar El Sherif" }, status: "present" },
  { id: "p5", name: { ar: "مريم فتحي", en: "Mariam Fathy" }, status: "counter_only" },
  { id: "p6", name: { ar: "كريم فؤاد", en: "Karim Fouad" }, status: "present" },
];

export const EMU_WALLET_OPENING = 25000;

export const EMU_WALLET_OPENING_ROWS: EmuWalletRow[] = [
  { id: "w1", date: "٠٣/٠٨", kind: "payment", ref: "TRX-0512", amount: 25000 },
];

export const EMU_DASHBOARD = {
  classesToday: 1,
  pendingGrades: 2,
  totalStudents: EMU_ROSTER.length,
  attendancePercent: 92,
} as const;
