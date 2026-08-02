// Re-export shim — the implementation lives in the shared kernel so apps/www
// and apps/superadmin can never run two versions of it. Same pattern as
// services/center/roster.ts and services/collaboration.
export * from "@repo/server-core/services/external-teachers/external-teachers";
export * from "@repo/server-core/services/external-teachers/manual-students";
export * from "@repo/server-core/services/external-teachers/manual-grades";
export * from "@repo/server-core/services/external-teachers/reconciliation";
export * from "@repo/server-core/services/external-teachers/gaps";
