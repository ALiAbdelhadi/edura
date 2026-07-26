// Moved to the shared kernel so apps/superadmin can run the SAME center
// capability against any center (Phase 3 — Operations). Re-export shim:
// every www import path and behaviour is unchanged.
export * from "@repo/server-core/services/attendance/attendance";
