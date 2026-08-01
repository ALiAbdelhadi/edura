import * as Sentry from "@sentry/nextjs";

/**
 * Next loads this once per server runtime. The configs are imported
 * conditionally so the Node build never pulls the edge SDK and vice versa.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Errors thrown inside React Server Components and route handlers do NOT reach
 * `Sentry.init`'s global handlers — Next catches them first. This hook is the
 * only way they get reported, which makes it the single most load-bearing line
 * of the whole Sentry setup on an App Router codebase.
 */
export const onRequestError = Sentry.captureRequestError;
