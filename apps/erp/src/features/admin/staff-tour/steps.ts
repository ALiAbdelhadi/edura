/**
 * The centre-staff first-run tour — THREE tours, not one.
 *
 * This portal's navigation is already built per sub-role (`navForRole` in the
 * staff layout), because a receptionist, a manager and an accountant do not
 * share a job. The tour follows the same split for the same reason: a step
 * about revenue reports shown to a receptionist, or about the counter shown to
 * an accountant, walks the reader to a door their tier does not open.
 *
 * WHAT EACH TIER ACTUALLY GETS (mirroring `navForRole` and the capability map
 * in `lib/authz/center-actor.ts`):
 *
 *   receptionist     counter board, students, messages, notes
 *   manager          all of the above + rooms + reports (attendance and fill
 *                    rates — NOT revenue, which is the accountant's tier)
 *   center_accountant finance only, and NO messaging at all — that tier appears
 *                    on no edge in the chat scope table, so its inbox would
 *                    always be empty and the portal does not give it one
 *
 * THE RECEPTIONIST'S TOUR IS MOSTLY NOT ABOUT THE MENU, and that is the point.
 * Their home screen IS the counter board, so the steps anchor to regions ON it
 * (`board-*`) rather than to sidebar entries. The old `/staff/counter` route
 * was deleted precisely because the board is the home; a tour pointing at a
 * menu item for it would be pointing at something that no longer exists.
 */

import type { TourStep } from "@/features/tour/guided-tour";

export type StaffTier = "receptionist" | "manager" | "center_accountant";

/** desktop sidebar → phone bar slot → phone overflow. */
const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

/** Shared tail: everyone gets notes, notifications and settings. */
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
  /* CONDITIONAL ANCHOR: the roster grid only exists once a lesson WITH students
     is selected, so out of hours — or on a centre with nothing scheduled — this
     card correctly degrades to a centred one. It is still worth a step: taking
     cash and checking in is the single most common thing that happens at this
     counter, and it must be explained whether or not a lesson is live at the
     moment the tour runs. */
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
  // Default to the receptionist's: it is the narrowest tour, so an unknown or
  // not-yet-loaded tier is never shown a screen it cannot reach.
  return RECEPTIONIST;
}
