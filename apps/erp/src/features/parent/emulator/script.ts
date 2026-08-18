/**
 * The parent emulator's script: what the parent is asked to do, in order.
 *
 * DATA, NOT CODE — exactly as the student and teacher scripts are. Adding a
 * mission must be adding an entry here, never editing the engine; otherwise the
 * second person to extend this writes a second engine. The engine in
 * `parent-emulator.tsx` knows only about `screen`, `target` and `spotlight`.
 *
 * Copy lives in `messages/<locale>/parent.json` under `parentEmulator.steps.*`,
 * so the script holds STRUCTURE and the translators hold WORDS.
 *
 * WHY THIS ORDER. It is the order in which a parent is blocked:
 *
 *   1. read the child       — orients them, no consequence
 *   2. LINK the child       — nothing else in the portal works until a link is
 *                             APPROVED; every other screen is empty without it
 *   3. the wallet           — met BEFORE paying, because the opening balance is
 *                             deliberately short of the lesson price, and
 *                             "top up, then pay" is the order the product forces
 *   4. pay for a lesson     — the act they came for
 *   5. child safety         — last on purpose: it is the one screen whose LIMITS
 *                             matter more than its features, and it lands better
 *                             once they have seen how much else they can do
 */

/** The simulated screens the engine can show. */
export type EmuScreen = "dashboard" | "children" | "wallet" | "pay" | "oversight";

export type EmuStep = {
  /** i18n key suffix under `parentEmulator.steps`. */
  id: string;
  screen: EmuScreen;
  /**
   * The control the parent must press to move on. Undefined = nothing to press:
   * the step is explaining something, and a "got it" button advances.
   *
   * A step with a target is the whole point of this being an emulator rather
   * than a slideshow — the parent performs the action, they do not watch it.
   */
  target?: string;
  /** Points at a region to look at while the step is read (no click needed). */
  spotlight?: string;
};

export type EmuMission = {
  id: string;
  icon: "home" | "users" | "wallet" | "card" | "shield";
  steps: EmuStep[];
};

export const MISSIONS: EmuMission[] = [
  {
    id: "board",
    icon: "home",
    steps: [
      { id: "welcome", screen: "dashboard" },
      { id: "children", screen: "dashboard", spotlight: "children" },
      { id: "record", screen: "dashboard", spotlight: "record" },
      { id: "goChildren", screen: "dashboard", target: "nav-children" },
    ],
  },
  {
    id: "link",
    icon: "users",
    steps: [
      { id: "twoWays", screen: "children", spotlight: "link-box" },
      { id: "byCode", screen: "children", target: "link-by-code" },
      { id: "approved", screen: "children" },
    ],
  },
  {
    id: "wallet",
    icon: "wallet",
    steps: [
      { id: "openWallet", screen: "children", target: "nav-wallet" },
      { id: "short", screen: "wallet", spotlight: "balance" },
      { id: "topUp", screen: "wallet", target: "topup" },
      { id: "whichChild", screen: "wallet", spotlight: "ledger" },
      { id: "notChildWallet", screen: "wallet" },
    ],
  },
  {
    id: "pay",
    icon: "card",
    steps: [
      { id: "openPay", screen: "wallet", target: "nav-pay" },
      { id: "pickLesson", screen: "pay", spotlight: "lesson" },
      { id: "payLesson", screen: "pay", target: "pay-lesson" },
      { id: "fromWallet", screen: "pay", target: "pay-from-wallet" },
      { id: "paid", screen: "pay" },
    ],
  },
  {
    id: "safety",
    icon: "shield",
    steps: [
      { id: "openSafety", screen: "pay", target: "nav-oversight" },
      { id: "readOnly", screen: "oversight", spotlight: "notice" },
      { id: "childKnows", screen: "oversight" },
      { id: "adultsOnly", screen: "oversight" },
      { id: "done", screen: "oversight" },
    ],
  },
];

/** Flat walk order, so the engine advances without knowing about missions. */
export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
