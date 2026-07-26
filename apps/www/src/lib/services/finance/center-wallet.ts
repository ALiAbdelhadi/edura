// Moved to the shared kernel so apps/superadmin can run the SAME center
// capability against any center (Phase 4 — money flows). Re-export shim:
// every www import path and behaviour is unchanged. These are the
// SANCTIONED money paths (recorded payment, refund, wallet top-up,
// payout request) — not a way to edit the ledger.
export * from "@repo/server-core/services/finance/center-wallet";
