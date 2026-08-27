import type { TourStep } from "@repo/ui/components/guided-tour";

export const SUPERADMIN_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "registrations", anchor: "nav-registrations" },
  { id: "users", anchor: "nav-users" },
  { id: "centers", anchor: "nav-centers" },
  { id: "moneyReadOnly", anchor: "nav-payments" },
  { id: "payouts", anchor: "nav-payouts" },
  { id: "settlements", anchor: "nav-settlements" },
  { id: "commission", anchor: "nav-commission" },
  { id: "catalog", anchor: "nav-catalog" },
  { id: "messaging", anchor: "nav-messaging" },
  { id: "audit", anchor: "nav-audit" },
  { id: "deletion", anchor: "nav-deletion" },
  { id: "security", anchor: "nav-security" },

  { id: "finish" },
];
