// Pure type contracts for the analytics/report payloads. Moved to the shared
// kernel because the report services there return these shapes; re-exported so
// every www import path (including the client-side transforms) keeps working.
export * from "@repo/server-core/analytics/contracts";
