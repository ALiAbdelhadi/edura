import { prisma } from "@repo/database";
import { closeRateLimiter } from "@repo/server-core/rate-limit/token-bucket";
import { registerAfterScheduler } from "./after";
import { createApp } from "./app";
import { assertBootEnv } from "./boot";
import { bindPublicDataCache, closePublicStore } from "./cache";
import { env } from "./env";
import { flushSentry, initSentry } from "./observability";

assertBootEnv();
const sentryOn = initSentry();
registerAfterScheduler();
bindPublicDataCache();

const app = createApp();
const server = Bun.serve({ port: env.port, fetch: app.fetch });
console.log(`[api] listening on :${server.port} (sentry ${sentryOn ? "on" : "off"})`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[api] ${signal}: shutting down`);
  await server.stop();
  try {
    await closeRateLimiter();
    await closePublicStore();
    await prisma.$disconnect();
    await flushSentry();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
