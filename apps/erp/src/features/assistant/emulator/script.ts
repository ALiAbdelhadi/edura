export type EmuScreen = "home" | "attendance" | "door" | "messages" | "notes";

export type EmuStep = {
  id: string;
  screen: EmuScreen;
  target?: string;
  spotlight?: string;
};

export type EmuMission = {
  id: string;
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

export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
