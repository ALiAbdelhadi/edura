import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient, Prisma } from "./generated/client/index";
import { runWithAuditTx, type AuditTx } from "./context";
import { hardenNeonWebSockets, isNeonSocketDropError } from "./neon-ws";
import { pinSslMode } from "./pg-ssl";
import {
  sessionRevocationExtension,
  softDeleteExtension,
  immutableExtension,
  auditLogExtension,
  roleGuardExtension,
  primeRoleGuard,
} from "./extensions/index";

hardenNeonWebSockets();

function createAdapter() {
  const rawConnectionString = process.env.DATABASE_URL;
  if (!rawConnectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at the Neon POOLED connection string.",
    );
  }
  const connectionString = pinSslMode(rawConnectionString);

  if (process.env.DATABASE_DRIVER === "pg") {
    return new PrismaPg({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
  }

  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
  }
  return new PrismaNeon({ connectionString });
}

function createPrisma() {
  const base = new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // SECURITY_AUDIT.md (2026-09-11) DISC-01: the hash is excluded from every
    // `users` read unless a call opts back in with `omit: { passwordHash: false }`
    // (or names it in `select`). One unselected query can no longer serialise it.
    omit: { user: { passwordHash: true } },
  });
  primeRoleGuard(base as unknown as Parameters<typeof primeRoleGuard>[0]);
  return base
    .$extends(sessionRevocationExtension)
    .$extends(softDeleteExtension)
    .$extends(immutableExtension)
    .$extends(auditLogExtension)
    .$extends(roleGuardExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createPrisma>;

export type TenantTx = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalForPrisma = globalThis as unknown as {
  __edura_prisma?: ExtendedPrismaClient;
};

let instance: ExtendedPrismaClient | undefined;

function getClient(): ExtendedPrismaClient {
  instance ??= globalForPrisma.__edura_prisma ?? createPrisma();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__edura_prisma = instance;
  }
  return instance;
}

export const prisma: ExtendedPrismaClient = new Proxy(
  {} as ExtendedPrismaClient,
  {
    get(_target, prop) {
      const client = getClient() as object;
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
    has(_target, prop) {
      return Reflect.has(getClient() as object, prop);
    },
    set(_target, prop, value) {
      return Reflect.set(getClient() as object, prop, value);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        getClient() as object,
        prop,
      );
      return descriptor && { ...descriptor, configurable: true };
    },
    ownKeys() {
      return Reflect.ownKeys(getClient() as object);
    },
  },
);

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

const CONNECTION_FAILURE_MESSAGES = [
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout",
  "Client has encountered a connection error and is not queryable",
  "server closed the connection unexpectedly",
  "terminating connection due to administrator command",
];

function isConnectionFailure(err: unknown): boolean {
  if (isNeonSocketDropError(err)) return true;
  for (let cur: unknown = err, hops = 0; cur != null && hops < 10; hops++) {
    const message = (cur as { message?: unknown }).message;
    if (
      typeof message === "string" &&
      CONNECTION_FAILURE_MESSAGES.some((m) => message.includes(m))
    ) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transactionWithRetry<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options: TxOptions,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let bodyCompleted = false;
    try {
      return await prisma.$transaction(
        async (tx) => {
          const result = await fn(tx);
          bodyCompleted = true;
          return result;
        },
        { ...DEFAULT_TX_OPTIONS, ...options },
      );
    } catch (err) {
      const retryable =
        isTransactionStartTimeout(err) ||
        (isConnectionFailure(err) && !bodyCompleted);
      if (attempt >= TRANSACTION_START_RETRIES || !retryable) {
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
    return runWithAuditTx(tx as unknown as AuditTx, () => fn(tx));
  }, options ?? {});
}

export async function withPlatformContext<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  return transactionWithRetry(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return runWithAuditTx(tx as unknown as AuditTx, () => fn(tx));
  }, options ?? {});
}

export { Prisma };
export * from "./generated/client/index";
