// Moved to the shared kernel so apps/superadmin can decide a stuck pending
// request without a second copy of the acceptance transaction (same precedent
// as services/blacklist/blacklist.ts). This file is a re-export shim: every
// www import path and behaviour is unchanged.
export * from "@repo/server-core/services/collaboration/collaboration";
