/**
 * The centre emulator's script: what the owner is asked to do, in order.
 *
 * DATA, NOT CODE — the same contract the student and teacher scripts hold.
 * Adding a mission is adding an entry here, never editing the engine.
 *
 * Copy lives in `messages/<locale>/admin-home.json` under
 * `centerEmulator.steps.*`, so the script holds STRUCTURE and the translators
 * hold WORDS.
 *
 * WHY THIS ORDER — it is the order in which a CENTRE loses money by not knowing,
 * which is a different order from the teacher's:
 *
 *   1. read the day        — orients, costs nothing
 *   2. PRICE THE CLASS     — the centre owns pricing, and the counter's own
 *                            error message says so ("the centre owner sets it
 *                            from the classes screen"). An unpriced class does
 *                            not just block a teacher — it stops the front desk
 *                            from taking money at all.
 *   3. work the counter    — cash + check-in in ONE commit, which is the single
 *                            most-used screen in an Egyptian centre, and the
 *                            walk-in who is not on the roster
 *   4. close the lesson    — where the centre's OWN share is credited, and the
 *                            step nobody performs by accident
 *   5. read the books      — the receipt, the net profit, and why a refund is a
 *                            new entry rather than a deletion
 *
 * 2 → 3 → 4 is a chain: pricing is what lets the counter collect, and the cash
 * collected is what the closing distributes. An owner who finishes has run their
 * centre's whole money path once.
 */

/** The simulated screens the engine can show. */
export type EmuScreen = "dashboard" | "classes" | "counter" | "books";

export type EmuStep = {
  /** i18n key suffix under `centerEmulator.steps`. */
  id: string;
  screen: EmuScreen;
  /** The control the owner must press to move on. Undefined = an explanation,
   *  advanced by a "got it" button. */
  target?: string;
  /** Points at a region to look at while the step is read (no click needed). */
  spotlight?: string;
};

export type EmuMission = {
  id: string;
  /** Lucide icon name rendered in the mission rail. */
  icon: "home" | "book" | "counter" | "coins" | "ledger";
  steps: EmuStep[];
};

export const MISSIONS: EmuMission[] = [
  {
    id: "readDay",
    icon: "home",
    steps: [
      { id: "welcome", screen: "dashboard" },
      { id: "figures", screen: "dashboard", spotlight: "figures" },
      { id: "pending", screen: "dashboard", spotlight: "pending" },
      { id: "goClasses", screen: "dashboard", target: "nav-classes" },
    ],
  },
  {
    id: "priceClass",
    icon: "book",
    steps: [
      { id: "openClass", screen: "classes", target: "class-c1" },
      { id: "unpriced", screen: "classes", spotlight: "unpriced" },
      { id: "setPrice", screen: "classes", target: "set-price" },
      { id: "priced", screen: "classes", spotlight: "price" },
      { id: "goCounter", screen: "classes", target: "nav-counter" },
    ],
  },
  {
    id: "counter",
    icon: "counter",
    steps: [
      { id: "pickTeacher", screen: "counter", target: "teacher-t1" },
      { id: "pickLesson", screen: "counter", target: "lesson-s1" },
      { id: "tabs", screen: "counter", spotlight: "tabs" },
      { id: "unpaidStudent", screen: "counter", spotlight: "row-p4" },
      { id: "armCollect", screen: "counter", target: "collect-p4" },
      { id: "confirmCollect", screen: "counter", target: "collect-confirm-p4" },
      { id: "collected", screen: "counter", spotlight: "row-p4" },
      { id: "offRoster", screen: "counter", spotlight: "row-p5" },
    ],
  },
  {
    id: "settle",
    icon: "coins",
    steps: [
      { id: "settleCard", screen: "counter", spotlight: "settle" },
      { id: "readShares", screen: "counter", spotlight: "shares" },
      { id: "pressSettle", screen: "counter", target: "settle" },
      { id: "confirmSettle", screen: "counter", target: "settle-confirm" },
      { id: "settled", screen: "counter", spotlight: "settled" },
    ],
  },
  {
    id: "books",
    icon: "ledger",
    steps: [
      { id: "goBooks", screen: "counter", target: "nav-books" },
      { id: "receipts", screen: "books", spotlight: "receipts" },
      { id: "netProfit", screen: "books", spotlight: "net" },
      { id: "refund", screen: "books", target: "refund-r3" },
      { id: "refunded", screen: "books", spotlight: "receipts" },
      { id: "done", screen: "books" },
    ],
  },
];

export const TOTAL_STEPS = MISSIONS.reduce((n, m) => n + m.steps.length, 0);

/** Flat walk order, so the engine advances without knowing about missions. */
export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
