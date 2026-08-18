/**
 * The accountant's first-run tour: welcome, seven tasks, then "your turn".
 *
 * IT IS NOT THE SUPER ADMIN'S TOUR WITH FEWER STEPS. The accountant's portal is
 * a restricted one — `/dashboard/finance` and `/api/v1/finance/**`, enforced at
 * the API layer rather than by hiding menu entries — so this tour is written
 * from what that role can actually reach, and it says plainly where the edge is.
 *
 * WHAT THE ROLE MAY DO, read off the route guards rather than assumed:
 *
 *   payments, subscriptions, invoices, transactions   GET
 *   payouts                                            GET + POST (generate),
 *                                                      approve, reject
 *   refunds                                            POST
 *   commission-settings                                **GET ONLY** — the rate
 *                                                      is the super admin's to
 *                                                      set; the accountant
 *                                                      reads what it is
 *
 * That last one is the reason a step exists for it at all: the menu shows
 * "Commission", so an accountant WILL open it and look for a save button. Being
 * told once beats hunting for a control that was never there.
 *
 * ORDER: the money in (payments, subscriptions) → the money out (payouts,
 * refunds) → the number that governs the split → your own account's security.
 *
 * Anchors are single ids: this app has no phone bottom bar, so there is no
 * second navigation for the same destination.
 */

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
