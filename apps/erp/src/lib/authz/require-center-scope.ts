// Moved to the shared kernel so the extracted center services enforce the same
// scope check from either app. Re-export shim — unchanged API.
export * from "@repo/server-core/authz/center-scope";
