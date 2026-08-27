export type EmuScreen = "dashboard" | "children" | "wallet" | "pay" | "oversight";

export type EmuStep = {
  id: string;
  screen: EmuScreen;
  target?: string;
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

export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
