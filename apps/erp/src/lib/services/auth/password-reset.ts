// Moved to the shared kernel so apps/superadmin can trigger a reset for a
// locked-out staff account against the SAME implementation. Re-export shim:
// every www import path and behaviour is unchanged.
export * from "@repo/server-core/services/auth/password-reset";
