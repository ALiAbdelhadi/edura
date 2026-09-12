import * as Sentry from "@sentry/nextjs";
import { assertSharedRateLimitStore } from "@repo/server-core/rate-limit/require-shared-store";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fails the boot, not the request: a missing shared store is a deploy mistake and
    // should surface at deploy time, not when someone is being brute-forced.
    // SECURITY_AUDIT.md (2026-09-11) AUTH-03: called unconditionally. The
    // function itself honours ALLOW_UNSHARED_RATE_LIMIT === "1"; the truthy
    // guard that stood here let `0` or `false` skip every check inside it.
    assertSharedRateLimitStore();
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
