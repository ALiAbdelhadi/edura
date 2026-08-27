import type { Locale } from "@/lib/i18n";

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

export const EMU_PLACE = {
  room: { ar: "قاعة ٣", en: "Hall 3" },
  teacher: { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" },
} satisfies Record<string, Bi>;

export const EMU_COVER = { daysLeft: 26 } as const;

export const EMU_WEEK: EmuSession[] = [
  { id: "s2", subject: titled(PHYS), time: "16:00", day: { ar: "الأحد", en: "Sun" } },
  { id: "s3", subject: titled(CHEM), time: "18:00", day: { ar: "الاثنين", en: "Mon" } },
];

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

export const EMU_WALLET_OPENING = 15000;

export const EMU_LEDGER_OPENING: EmuLedgerRow[] = [
  { id: "l1", date: "٠١/٠٨", kind: "topup", ref: "TRX-0431", amount: 15000, balance: 15000 },
];

export const EMU_RECORD = { attendanceRate: 92, averagePercent: 88 } as const;
