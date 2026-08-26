export type EmuScreen = "dashboard" | "classes" | "counter" | "books";

export type EmuStep = {
  id: string;
  screen: EmuScreen;
  target?: string;
  spotlight?: string;
};

export type EmuMission = {
  id: string;
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

export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
