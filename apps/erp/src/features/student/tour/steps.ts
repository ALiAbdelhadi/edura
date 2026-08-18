/**
 * The student's first-run tour: welcome, twelve tasks, then "now it's your turn".
 *
 * EVERY STEP TEACHES A PROCEDURE, NOT A LOCATION. Pointing at a tab and saying
 * "this is your wallet" teaches nothing the label does not already say — so each
 * step carries a `how` list in the copy (`steps.<id>.how`), which is the ordered
 * presses that actually perform the task. A step without one is only allowed for
 * the welcome and finish cards.
 *
 * WHAT THE TWELVE ARE, and why in this order — it is the order a student needs
 * them, which is roughly the order they get stuck:
 *
 *   read the day → the schedule → JOIN a class → PAY for it → get the receipt →
 *   the card you show at the counter → check you were marked present →
 *   read your marks → message your teacher → unlock messaging if it is locked →
 *   turn on phone notifications → link your parent
 *
 * Two steps point at Settings and two at the Wallet. That repetition is honest:
 * they are different TASKS that happen to live on the same screen, and merging
 * them would hide one of them.
 *
 * EACH ANCHOR IS A CHAIN, because the same destination lives somewhere else on
 * a phone:
 *
 *   nav-x   the sidebar row            (desktop)
 *   bar-x   the bottom-bar slot        (phone, if it won a slot)
 *   bar-more  the "more" button        (phone, if it did not)
 *
 * The engine takes the first one that is actually VISIBLE — both navigations
 * are in the DOM at once, one CSS-hidden — and tells the reader when it had to
 * fall back to "more", since that is one press further than the step says.
 */

import type { TourStep } from "@/features/tour/guided-tour";

/** desktop sidebar → phone bar slot → phone overflow. */
const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const STUDENT_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  // On the page itself, so it needs no per-viewport chain.
  { id: "upNext", anchor: "student-upnext" },

  { id: "schedule", anchor: at("schedule") },
  { id: "subscribe", anchor: at("subjects") },
  { id: "payWallet", anchor: at("wallet") },
  { id: "receipts", anchor: at("wallet") },
  { id: "card", anchor: at("id") },
  { id: "attendance", anchor: at("attendance") },
  { id: "grades", anchor: at("grades") },
  { id: "messages", anchor: at("messages") },
  { id: "unlockMessaging", anchor: at("settings") },
  { id: "pushNotifications", anchor: at("settings") },
  { id: "family", anchor: at("family") },
  // Where to rehearse — the last card in every other portal's tour, and the
  // handover from "read about it" to "do it against a fake world".
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
