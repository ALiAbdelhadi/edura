import type { TourStep } from "@/features/tour/guided-tour";

export type StaffTier = "receptionist" | "manager" | "center_accountant";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

const TAIL: TourStep[] = [
  { id: "notes", anchor: at("notes") },
  { id: "notifications", anchor: at("notifications") },
  { id: "finish" },
];

const RECEPTIONIST: TourStep[] = [
  { id: "welcomeReception" },
  { id: "boardTeacher", anchor: "board-teacher" },
  { id: "boardTabs", anchor: "board-tabs" },
  { id: "boardSearch", anchor: "board-search" },
  { id: "boardCash", anchor: "board-roster" },
  { id: "boardWalkIn", anchor: "board-walkin" },
  { id: "students", anchor: at("students") },
  { id: "messages", anchor: at("messages") },
  ...TAIL,
];

const MANAGER: TourStep[] = [
  { id: "welcomeManager" },
  { id: "boardTeacher", anchor: "board-teacher" },
  { id: "boardTabs", anchor: "board-tabs" },
  { id: "boardSearch", anchor: "board-search" },
  { id: "boardWalkIn", anchor: "board-walkin" },
  { id: "students", anchor: at("students") },
  { id: "importStudents", anchor: at("students") },
  { id: "rooms", anchor: at("rooms") },
  { id: "reports", anchor: at("reports") },
  { id: "messages", anchor: at("messages") },
  ...TAIL,
];

const ACCOUNTANT: TourStep[] = [
  { id: "welcomeAccountant" },
  { id: "finance", anchor: at("finance") },
  { id: "exports", anchor: at("finance") },
  { id: "noMessaging" },
  ...TAIL,
];

export function staffTourSteps(tier: StaffTier | null | undefined): TourStep[] {
  if (tier === "center_accountant") return ACCOUNTANT;
  if (tier === "manager") return MANAGER;
  return RECEPTIONIST;
}
