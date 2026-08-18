/**
 * The emulator's script: what the learner is asked to do, in order.
 *
 * DATA, NOT CODE — deliberately. Adding a mission must be adding an entry
 * here, never editing the engine; otherwise the second person to extend this
 * writes a second engine. The engine in `student-emulator.tsx` knows only
 * about `screen`, `target` and `advanceOn`.
 *
 * Copy lives in `messages/<locale>/student.json` under `studentEmulator.steps.*`,
 * so
 * the script holds STRUCTURE and the translators hold WORDS.
 */

/** The simulated screens the engine can show. */
export type EmuScreen = "dashboard" | "subjects" | "wallet" | "card";

export type EmuStep = {
  /** i18n key suffix under `studentEmulator.steps`. */
  id: string;
  screen: EmuScreen;
  /**
   * The control the learner must press to move on. Undefined = nothing to
   * press: the step is explaining something, and a "got it" button advances.
   *
   * A step with a target is the whole point of this being an emulator rather
   * than a slideshow — the learner performs the action, they do not watch it.
   */
  target?: string;
  /** Points at a region to look at while the step is read (no click needed). */
  spotlight?: string;
};

export type EmuMission = {
  id: string;
  /** Lucide icon name rendered in the mission rail. */
  icon: "home" | "book" | "wallet" | "card";
  steps: EmuStep[];
};

export const MISSIONS: EmuMission[] = [
  {
    id: "readBoard",
    icon: "home",
    steps: [
      { id: "welcome", screen: "dashboard" },
      { id: "upNext", screen: "dashboard", spotlight: "up-next" },
      { id: "record", screen: "dashboard", spotlight: "record" },
      { id: "goSubjects", screen: "dashboard", target: "nav-subjects" },
    ],
  },
  {
    id: "subscribe",
    icon: "book",
    steps: [
      { id: "openSubject", screen: "subjects", target: "subject-chem" },
      { id: "readGroup", screen: "subjects", spotlight: "group-g1" },
      { id: "fullGroup", screen: "subjects", spotlight: "group-g2" },
      { id: "subscribe", screen: "subjects", target: "subscribe-g1" },
      { id: "subscribed", screen: "subjects" },
    ],
  },
  {
    id: "money",
    icon: "wallet",
    steps: [
      { id: "openWallet", screen: "subjects", target: "nav-wallet" },
      { id: "balance", screen: "wallet", spotlight: "balance" },
      { id: "topUp", screen: "wallet", target: "topup" },
      { id: "afterTopUp", screen: "wallet", spotlight: "ledger" },
      { id: "receipt", screen: "wallet", spotlight: "receipts" },
    ],
  },
  {
    id: "card",
    icon: "card",
    steps: [
      { id: "openCard", screen: "wallet", target: "nav-card" },
      { id: "showCard", screen: "card", target: "show-card" },
      { id: "readCode", screen: "card", spotlight: "code" },
      { id: "counter", screen: "card" },
      { id: "done", screen: "card" },
    ],
  },
];

export const TOTAL_STEPS = MISSIONS.reduce((n, m) => n + m.steps.length, 0);

/** Flat walk order, so the engine advances without knowing about missions. */
export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
