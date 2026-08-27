import type { TourStep } from "@repo/ui/components/guided-tour";

export const FINANCE_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "payments", anchor: "fin-payments" },
  { id: "subscriptions", anchor: "fin-subscriptions" },
  { id: "payouts", anchor: "fin-payouts" },
  { id: "refunds", anchor: "fin-payments" },
  { id: "commission", anchor: "fin-commission" },
  { id: "ledgerIsFinal", anchor: "fin-payments" },
  { id: "security", anchor: "fin-security" },

  { id: "finish" },
];
