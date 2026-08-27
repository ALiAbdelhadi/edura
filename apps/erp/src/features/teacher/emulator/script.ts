export type EmuScreen = "dashboard" | "classes" | "attendance" | "wallet";

export type EmuStep = {
  id: string;
  screen: EmuScreen;
  target?: string;
  spotlight?: string;
};

export type EmuMission = {
  id: string;
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
      { id: "withdrawConfirm", screen: "wallet", target: "withdraw-confirm" },
      { id: "reserved", screen: "wallet", spotlight: "figures" },
      { id: "requests", screen: "wallet", spotlight: "requests" },
      { id: "done", screen: "wallet" },
    ],
  },
];

export const TOTAL_STEPS = MISSIONS.reduce((n, m) => n + m.steps.length, 0);

export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
