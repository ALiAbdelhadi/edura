import type { Locale } from "@/lib/i18n";

export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuAttendance = "present" | "absent" | "excused" | "counter_only";

export type EmuPupil = {
  id: string;
  name: Bi;
  code: string;
  status: EmuAttendance;
  counterChecked: boolean;
  doorConfirmed: boolean;
};

export type EmuNote = {
  id: string;
  body: Bi;
  status: "open" | "done";
  by: Bi;
  readBy: number;
  total: number;
};

export type EmuMessage = { id: string; from: Bi; body: Bi; mine: boolean };

export const EMU_PRINCIPAL = { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" } satisfies Bi;
export const EMU_ASSISTANT = { ar: "أ. سارة منير", en: "Ms Sara Mounir" } satisfies Bi;

export const EMU_CLASS = {
  id: "c1",
  title: { ar: "الكيمياء — الثالث الثانوي", en: "Chemistry — Secondary 3" },
  room: { ar: "قاعة ٢", en: "Hall 2" },
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

export const EMU_ROSTER: EmuPupil[] = [
  {
    id: "p1",
    name: { ar: "نور محمود", en: "Nour Mahmoud" },
    code: "G7K3M2QF",
    status: "present",
    counterChecked: true,
    doorConfirmed: true,
  },
  {
    id: "p2",
    name: { ar: "يوسف عبد الله", en: "Youssef Abdullah" },
    code: "G4B9NT21",
    status: "present",
    counterChecked: true,
    doorConfirmed: true,
  },
  {
    id: "p3",
    name: { ar: "سلمى رفعت", en: "Salma Refaat" },
    code: "GQ2M7V8H",
    status: "present",
    counterChecked: true,
    doorConfirmed: true,
  },
  {
    id: "p4",
    name: { ar: "عمر الشريف", en: "Omar El Sherif" },
    code: "GH5T9WK3",
    status: "present",
    counterChecked: true,
    doorConfirmed: true,
  },
  {
    id: "p5",
    name: { ar: "مريم فتحي", en: "Mariam Fathy" },
    code: "G6XC1PR4",
    status: "counter_only",
    counterChecked: true,
    doorConfirmed: false,
  },
  {
    id: "p6",
    name: { ar: "كريم فؤاد", en: "Karim Fouad" },
    code: "GZ8Q4LD7",
    status: "counter_only",
    counterChecked: false,
    doorConfirmed: false,
  },
];

export const EMU_MESSAGES: EmuMessage[] = [
  {
    id: "m1",
    from: { ar: "والدة نور محمود", en: "Nour Mahmoud's mother" },
    body: {
      ar: "لو سمحت، نور هتتأخر النهاردة شوية.",
      en: "Excuse me — Nour will be a little late today.",
    },
    mine: false,
  },
];

export const EMU_NOTES: EmuNote[] = [
  {
    id: "n1",
    body: {
      ar: "صوّر امتحان الأحد ٣٠ نسخة قبل ٤ م.",
      en: "Photocopy 30 sets of Sunday's exam before 4pm.",
    },
    status: "open",
    by: EMU_PRINCIPAL,
    readBy: 1,
    total: 2,
  },
  {
    id: "n2",
    body: {
      ar: "جهّز كشف حضور القاعة ٢.",
      en: "Prepare the Hall 2 attendance sheet.",
    },
    status: "done",
    by: EMU_ASSISTANT,
    readBy: 2,
    total: 2,
  },
];
