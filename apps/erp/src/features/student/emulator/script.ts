export type EmuScreen = "dashboard" | "subjects" | "wallet" | "card";

export type EmuStep = {
  id: string;
  screen: EmuScreen;
  target?: string;
  spotlight?: string;
};

export type EmuMission = {
  id: string;
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

export type FlatStep = EmuStep & { mission: string; missionIndex: number; indexInMission: number };

export const FLAT_STEPS: FlatStep[] = MISSIONS.flatMap((m, mi) =>
  m.steps.map((s, si) => ({ ...s, mission: m.id, missionIndex: mi, indexInMission: si })),
);
