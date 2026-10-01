import * as Sentry from "@sentry/nextjs";

// Phase 5: the boot checks that stood here (shared rate-limit store, ERP
// revalidation listener) run in apps/admin-api (src/server.ts via
// @repo/service-kit/boot). The frontend only wires Sentry.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
