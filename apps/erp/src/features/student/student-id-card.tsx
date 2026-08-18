/**
 * Re-export shim.
 *
 * The card was promoted to `@repo/ui/components/student-id-card` when the back
 * office gained the ability to view, reissue and revoke a student's card
 * (2026-08-09) — two apps drawing one identity document from two files is how
 * the printed card and the operator's copy come to disagree.
 *
 * This keeps every existing www import path working unchanged, which is the
 * same "promote with a re-export, change no call site" rule the Ledger layer
 * and `theme-mode-provider` already follow.
 */
export {
  StudentIdCard,
  CARD_W,
  CARD_H,
  WORDMARK,
  type CardLabels,
  type StudentIdCardData,
} from "@repo/ui/components/student-id-card";
