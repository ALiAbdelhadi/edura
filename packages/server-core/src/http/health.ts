import { prisma } from "@repo/database";
import { rateLimiterDegraded } from "../rate-limit/token-bucket";

const DB_TIMEOUT_MS = 8_000;

export type HealthStatus = "ok" | "degraded";

export type HealthBody = {
  status: HealthStatus;
  db: "up" | "down";
  rateLimiter: "shared" | "local";
  mail?: { ok: boolean; code?: string };
  time: string;
};

async function checkDb(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("health db timeout")), DB_TIMEOUT_MS);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (err) {
    console.error(
      `[health] database check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function healthResponse(opts?: { deepMail?: boolean }): Promise<Response> {
  const dbUp = await checkDb();
  let mail: { ok: boolean; code?: string } | undefined;
  if (opts?.deepMail) {
    const { verifySmtp } = await import("@repo/notifications/transport/smtp");
    mail = await verifySmtp();
  }
  const limitsShared = Boolean(process.env.REDIS_URL) && !rateLimiterDegraded();
  const body: HealthBody = {
    status: dbUp ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
    rateLimiter: limitsShared ? "shared" : "local",
    ...(mail ? { mail } : {}),
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: dbUp ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      ...(dbUp ? {} : { "retry-after": "30" }),
    },
  });
}
