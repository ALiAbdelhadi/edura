/**
 * The assistant emulator's script: what the assistant is asked to do, in order.
 *
 * DATA, NOT CODE — the same contract the student, teacher, centre and parent
 * scripts hold. Adding a mission is adding an entry here, never editing an
 * engine.
 *
 * Copy lives in `messages/<locale>/assistant.json` under `emulator.steps.*`.
 *
 * WHY THIS ORDER. The other four roles are walked along their MONEY path. An
 * assistant has no money of their own, so theirs is walked along the AUTHORITY
 * path — what is yours, what is your teacher's, and where the line is:
 *
 *   1. whose account is this   — you act FOR a teacher; the wallet is absent
 *                                from your menu, and that absence is correct
 *   2. attendance              — the daily job, and the one the settlement reads
 *   3. the door                — your reason for existing in `counter + door`
 *                                mode, INCLUDING the student the door must
 *                                refuse, which is where an obliging assistant
 *                                quietly breaks the money path
 *   4. closing the lesson      — you CAN, and the money lands in the TEACHER's
 *                                wallet with your name on the action
 *   5. your own voice          — you message as YOURSELF, never as the teacher,
 *                                and the team board is how the two of you agree
 *
 * 3 → 4 is the pair that matters: a door confirmation is what makes a student
 * count, and closing is what turns those counts into the teacher's money.
 */

/** The simulated screens the engine can show. */
export type EmuScreen = "home" | "attendance" | "door" | "messages" | "notes";

export type EmuStep = {
  /** i18n key suffix under `emulator.steps`. */
  id: string;
  screen: EmuScreen;
  /** The control the assistant must press to move on. */
  target?: string;
  /** A region to look at while the step is read (no click needed). */
  spotlight?: string;
};

export type EmuMission = {
  id: string;
  /** Lucide icon name rendered in the mission rail. */
  icon: "shield" | "check" | "door" | "coins" | "message";
  steps: EmuStep[];
};

export const MISSIONS: EmuMission[] = [
  {
    id: "delegation",
    icon: "shield",
    steps: [
      { id: "welcome", screen: "home" },
      { id: "actFor", screen: "home", spotlight: "principal" },
      { id: "noWallet", screen: "home", spotlight: "limits" },
      { id: "goAttendance", screen: "home", target: "nav-attendance" },
    ],
  },
  {
    id: "attendance",
    icon: "check",
    steps: [
      { id: "pickLesson", screen: "attendance", target: "lesson-s1" },
      { id: "roster", screen: "attendance", spotlight: "roster" },
      { id: "markAbsent", screen: "attendance", target: "absent-p3" },
      { id: "save", screen: "attendance", target: "save-attendance" },
    ],
  },
  {
    id: "door",
    icon: "door",
    steps: [
      { id: "goDoor", screen: "attendance", target: "nav-door" },
      { id: "waiting", screen: "door", spotlight: "row-p5" },
      { id: "confirmDoor", screen: "door", target: "door-p5" },
      { id: "refused", screen: "door", spotlight: "row-p6" },
      { id: "toCounter", screen: "door", target: "door-p6" },
      { id: "refusedShown", screen: "door" },
    ],
  },
  {
    id: "settle",
    icon: "coins",
    steps: [
      { id: "backToAttendance", screen: "door", target: "nav-attendance" },
      { id: "settleCard", screen: "attendance", spotlight: "settle" },
      { id: "whoseMoney", screen: "attendance", spotlight: "shares" },
      { id: "pressSettle", screen: "attendance", target: "settle" },
      { id: "confirmSettle", screen: "attendance", target: "settle-confirm" },
      { id: "settled", screen: "attendance", spotlight: "settled" },
    ],
  },
  {
    id: "voice",
    icon: "message",
    steps: [
      { id: "goMessages", screen: "attendance", target: "nav-messages" },
      { id: "yourName", screen: "messages", target: "send" },
      { id: "identity", screen: "messages", spotlight: "thread" },
      { id: "goNotes", screen: "messages", target: "nav-notes" },
      { id: "board", screen: "notes", spotlight: "note-n1" },
      { id: "markDone", screen: "notes", target: "done-n1" },
      { id: "done", screen: "notes" },
    ],
  },
];

export const TOTAL_STEPS = MISSIONS.reduce((n, m) => n + m.steps.length, 0);

/** Flat walk order, so the engine advances without knowing about missions. */
export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
