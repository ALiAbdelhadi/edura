// better-auth is a dependency of this package, not of the hosts. Under Bun's
// isolated installs a host cannot resolve it at all, and if it declared its own
// copy the request state (`setShouldSkipSessionRefresh`) would live in that
// copy, not in the one createErpAuth is built with — so a host-side plugin
// takes these from here and is guaranteed the same module instances. APIError
// is here for the same reason: an `instanceof` against another copy is false.
export { APIError, createAuthMiddleware, setShouldSkipSessionRefresh } from "better-auth/api";
export type { BetterAuthPlugin } from "better-auth";
