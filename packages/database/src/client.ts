import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient, Prisma } from "./generated/client/index";
import {
  softDeleteExtension,
  immutableExtension,
  auditLogExtension,
} from "./extensions/index";

if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Point it at the Neon POOLED connection string.",
  );
}

// Driver selection: short-lived serverless functions (Next.js) use the Neon
// serverless driver (default). Long-running processes (the realtime WebSocket
// server) set DATABASE_DRIVER=pg to get a regular node-postgres connection
// pool — persistent TCP connections instead of per-call WebSocket dials.
function createAdapter() {
  if (process.env.DATABASE_DRIVER === "pg") {
    return new PrismaPg({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
  }
  return new PrismaNeon({ connectionString });
}

function createPrisma() {
  const base = new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return base
    .$extends(softDeleteExtension)
    .$extends(immutableExtension)
    .$extends(auditLogExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createPrisma>;

export type TenantTx = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalForPrisma = globalThis as unknown as {
  __edura_prisma?: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient =
  globalForPrisma.__edura_prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__edura_prisma = prisma;
}

export type TxOptions = { maxWait?: number; timeout?: number };

const DEFAULT_TX_OPTIONS: Required<TxOptions> = {
  maxWait: 10_000,
  timeout: 20_000,
};

const TRANSACTION_START_RETRIES = 2;
const TRANSACTION_RETRY_DELAY_MS = 300;

function isTransactionStartTimeout(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2028" &&
    err.message.includes("Unable to start a transaction in the given time")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transactionWithRetry<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options: TxOptions,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        ...DEFAULT_TX_OPTIONS,
        ...options,
      });
    } catch (err) {
      if (
        attempt >= TRANSACTION_START_RETRIES ||
        !isTransactionStartTimeout(err)
      ) {
        throw err;
      }
      await delay(TRANSACTION_RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

export async function withTenant<T>(
  centerId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  return transactionWithRetry(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_center_id', ${centerId}, true)`;
    return fn(tx);
  }, options ?? {});
}

export async function withPlatformContext<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  return transactionWithRetry(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  }, options ?? {});
}

export { Prisma };
export * from "./generated/client/index";
