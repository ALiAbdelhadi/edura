import type { Locale } from "@/lib/i18n";

export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuChild = {
  id: string;
  name: Bi;
  grade: Bi;
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
  date: string;
  kind: "topup" | "payment";
  child: Bi | null;
  amount: number;
  balance: number;
};

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
