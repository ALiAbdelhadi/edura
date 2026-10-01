import { prisma } from "@repo/database";
import { closeRateLimiter } from "@repo/server-core/rate-limit/token-bucket";
import { registerAfterScheduler } from "./after";
import { createApp } from "./app";
import { assertBootEnv } from "./boot";
import { env } from "./env";
import { registerErpRevalidation } from "./erp-revalidate";
import { flushSentry, initSentry } from "./observability";

assertBootEnv();
// Reports to whatever SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN names in this
// deployment — the same selection apps/superadmin's sentry.server.config.ts
// makes, so the service lands in the back office's Sentry project when it is
// deployed with the back office's variables.
const sentryOn = initSentry();
registerAfterScheduler();
// Back-office writes that change a public listing tell the ERP to drop its
// cached copy (erp-revalidate.ts), as apps/superadmin/instrumentation.ts did.
registerErpRevalidation();

const app = createApp();
const server = Bun.serve({ port: env.port, fetch: app.fetch });
console.log(`[admin-api] listening on :${server.port} (sentry ${sentryOn ? "on" : "off"})`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[admin-api] ${signal}: shutting down`);
  await server.stop();
  try {
    await closeRateLimiter();
    await prisma.$disconnect();
    await flushSentry();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
