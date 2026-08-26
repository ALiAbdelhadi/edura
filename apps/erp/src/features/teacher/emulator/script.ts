/**
 * The teacher emulator's script: what the teacher is asked to do, in order.
 *
 * DATA, NOT CODE — deliberately, exactly as the student script is. Adding a
 * mission must be adding an entry here, never editing the engine; otherwise the
 * second person to extend this writes a second engine. The engine in
 * `teacher-emulator.tsx` knows only about `screen`, `target` and `spotlight`.
 *
 * Copy lives in `messages/<locale>/teacher.json` under `teacherEmulator.steps.*`,
 * so the script holds STRUCTURE and the translators hold WORDS.
 *
 * WHY THIS ORDER. It is the order in which a teacher loses money by not knowing:
 *
 *   1. read the day            — cheap, orients them, no consequence
 *   2. price the class         — an unpriced class blocks EVERYTHING below it
 *   3. take attendance         — including the `counter_only` state, which
 *                                silently excludes a child who paid
 *   4. close the lesson        — the step that actually credits the wallet, and
 *                                the one no real screen forces on anybody
 *   5. the wallet and a payout — where "available" ≠ "balance" is met once, here,
 *                                instead of as a support ticket
 *
 * Missions 2→4 are a chain on purpose: pricing is what makes closing possible,
 * and closing is what makes the wallet move. A teacher who finishes this has
 * performed the whole money path once.
 */

/** The simulated screens the engine can show. */
export type EmuScreen = "dashboard" | "classes" | "attendance" | "wallet";

export type EmuStep = {
  /** i18n key suffix under `teacherEmulator.steps`. */
  id: string;
  screen: EmuScreen;
  /**
   * The control the teacher must press to move on. Undefined = nothing to
   * press: the step is explaining something, and a "got it" button advances.
   *
   * A step with a target is the whole point of this being an emulator rather
   * than a slideshow — the teacher performs the action, they do not watch it.
   */
  target?: string;
  /** Points at a region to look at while the step is read (no click needed). */
  spotlight?: string;
};

export type EmuMission = {
  id: string;
  /** Lucide icon name rendered in the mission rail. */
  icon: "home" | "book" | "check" | "coins" | "wallet";
  steps: EmuStep[];
};

export const MISSIONS: EmuMission[] = [
  {
    id: "readDay",
    icon: "home",
    steps: [
      { id: "welcome", screen: "dashboard" },
      { id: "classesToday", screen: "dashboard", spotlight: "figures" },
      { id: "pendingGrades", screen: "dashboard", spotlight: "pending" },
      { id: "todaySchedule", screen: "dashboard", spotlight: "schedule" },
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
      { id: "goAttendance", screen: "classes", target: "nav-attendance" },
    ],
  },
  {
    id: "attendance",
    icon: "check",
    steps: [
      { id: "pickLesson", screen: "attendance", target: "lesson-s1" },
      { id: "roster", screen: "attendance", spotlight: "roster" },
      { id: "markAbsent", screen: "attendance", target: "absent-p3" },
      { id: "counterOnly", screen: "attendance", spotlight: "row-p5" },
      { id: "fixCounterOnly", screen: "attendance", target: "present-p5" },
      { id: "save", screen: "attendance", target: "save-attendance" },
    ],
  },
  {
    id: "settle",
    icon: "coins",
    steps: [
      { id: "settleCard", screen: "attendance", spotlight: "settle" },
      { id: "readShares", screen: "attendance", spotlight: "shares" },
      { id: "pressSettle", screen: "attendance", target: "settle" },
      { id: "confirmSettle", screen: "attendance", target: "settle-confirm" },
      { id: "settled", screen: "attendance", spotlight: "settled" },
      { id: "onceOnly", screen: "attendance" },
    ],
  },
  {
    id: "money",
    icon: "wallet",
    steps: [
      { id: "openWallet", screen: "attendance", target: "nav-wallet" },
      { id: "balance", screen: "wallet", spotlight: "figures" },
      { id: "withdraw", screen: "wallet", target: "withdraw" },
      // The second press. The real wallet arms before it commits, so the
      // rehearsal does too — a mission that still ended at one press would be
      // teaching a ceremony the product no longer has.
      { id: "withdrawConfirm", screen: "wallet", target: "withdraw-confirm" },
      { id: "reserved", screen: "wallet", spotlight: "figures" },
      { id: "requests", screen: "wallet", spotlight: "requests" },
      { id: "done", screen: "wallet" },
    ],
  },
];

export const TOTAL_STEPS = MISSIONS.reduce((n, m) => n + m.steps.length, 0);

/** Flat walk order, so the engine advances without knowing about missions. */
export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
