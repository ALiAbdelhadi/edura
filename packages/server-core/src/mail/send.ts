// =============================================================================
// SHIM. The SMTP transport moved to @repo/notifications/transport/smtp so the
// notification package can be a LEAF: it owns templates AND the wire, and
// server-core depends on it rather than the other way round. Without the move,
// password-reset.ts (here) calling a template renderer (there) that calls
// sendMail (here) would be a cycle.
//
// Every existing import path and behaviour is unchanged — same pattern as the
// collaboration.ts / password-reset.ts / blacklist.ts kernel moves.
// =============================================================================
export * from "@repo/notifications/transport/smtp";
