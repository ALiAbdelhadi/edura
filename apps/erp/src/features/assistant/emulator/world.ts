/**
 * The assistant emulator's world — a complete, fake shift beside one teacher.
 *
 * WHY THIS EXISTS AT ALL: an assistant's account is created BY a teacher and
 * starts with nothing of its own — no class, no roster, no money, and (by
 * design) no wallet at all. A guided tour of the real screens on day one would
 * be a tour of empty states. So the emulator ships the shift and the assistant
 * practises inside it.
 *
 * NOTHING HERE IS EVER SENT ANYWHERE. No fetch, no mutation, no attendance row,
 * no ledger entry. Every figure is React state in `assistant-emulator.tsx`.
 *
 * THE ONE THING THIS WORLD MODELS THAT NO OTHER ROLE'S DOES: the assistant acts
 * for somebody else. So the world names a PRINCIPAL (the teacher) beside the
 * learner, and the money that a closed lesson produces belongs to that teacher's
 * wallet — never to the assistant. Getting that wrong in a practice copy would
 * teach a new hire to expect a payout that will never arrive.
 */

import type { Locale } from "@/lib/i18n";

/** Every visible string in the world carries both scripts. */
export type Bi = { ar: string; en: string };
export const pick = (v: Bi, locale: Locale): string => (locale === "ar" ? v.ar : v.en);

export type EmuAttendance = "present" | "absent" | "excused" | "counter_only";

export type EmuPupil = {
  id: string;
  name: Bi;
  code: string;
  status: EmuAttendance;
  /** Passed the front desk? The door screen refuses anyone who has not. */
  counterChecked: boolean;
  /** Confirmed at the classroom door. */
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

/** The teacher the assistant acts FOR, and the assistant themselves. */
export const EMU_PRINCIPAL = { ar: "أ. هشام عزيز", en: "Mr Hossam Aziz" } satisfies Bi;
export const EMU_ASSISTANT = { ar: "أ. سارة منير", en: "Ms Sara Mounir" } satisfies Bi;

export const EMU_CLASS = {
  id: "c1",
  title: { ar: "الكيمياء — الثالث الثانوي", en: "Chemistry — Secondary 3" },
  room: { ar: "قاعة ٢", en: "Hall 2" },
  time: "16:00 – 17:30",
} as const;

/** 120 EGP a lesson, and the split the teacher's own tour uses — the same
 *  lesson seen from the other chair, so the two tours cannot contradict. */
export const EMU_SESSION_PRICE = 12000;

export const EMU_SPLIT = {
  platform: 1800,
  centre: 3000,
  get teacher() {
    return EMU_SESSION_PRICE - this.platform - this.centre;
  },
} as const;

/**
 * Six students. Two states are here because they are the assistant's whole job
 * in `counter + door` mode:
 *   • `p5` passed the counter and is NOT yet door-confirmed — the row the
 *     assistant exists to clear.
 *   • `p6` never passed the counter, so the door MUST refuse them. An assistant
 *     who learns to wave that student through is the hole in the money path.
 */
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
