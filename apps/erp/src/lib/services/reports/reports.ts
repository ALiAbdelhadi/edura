// Moved to the shared kernel so the back office can read the SAME reports for
// any center (Phase 5). Re-export shim — every www import path and behaviour is
// unchanged. Read-only throughout: these are aggregations, not writes.
export * from "@repo/server-core/services/reports/reports";
