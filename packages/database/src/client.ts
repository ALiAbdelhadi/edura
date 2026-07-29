import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient, Prisma } from "./generated/client/index";
import { hardenNeonWebSockets, isNeonSocketDropError } from "./neon-ws";
import {
  sessionRevocationExtension,
  softDeleteExtension,
  immutableExtension,
  auditLogExtension,
  roleGuardExtension,
} from "./extensions/index";

// AT IMPORT, not in createAdapter(): the ~40 DB test suites assign
// `neonConfig.webSocketConstructor = ws` at their own module scope, and imports
// are evaluated before the importing module's body. Installing here is the only
// point guaranteed to precede them. It reads no env and opens no connection, so
// the deliberate laziness of `prisma` below is preserved. See neon-ws.ts for
// why a dropped socket used to take the whole process down.
hardenNeonWebSockets();

// Driver selection: short-lived serverless functions (Next.js) use the Neon
// serverless driver (default). Long-running processes (the realtime WebSocket
// server) set DATABASE_DRIVER=pg to get a regular node-postgres connection
// pool — persistent TCP connections instead of per-call WebSocket dials.
//
// Everything here runs on FIRST QUERY, not at import (see `prisma` below).
function createAdapter() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at the Neon POOLED connection string.",
    );
  }

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
  });
  return base
    // C-03 first (innermost) on purpose: softDeleteExtension rewrites
    // user.delete → user.update({ deletedAt }) against the client it was
    // extended FROM, so revocation must already be in place there for a
    // soft-delete to bump the session epoch too.
    .$extends(sessionRevocationExtension)
    .$extends(softDeleteExtension)
    .$extends(immutableExtension)
    .$extends(auditLogExtension)
    // OUTERMOST, so it runs before any other extension touches data: refuse to
    // serve at all on a connection that can see through RLS (FINDING 0). One
    // memoised SELECT per process; the three owner-legitimate scripts open
    // their own pools and never reach this client.
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

// LAZY ON PURPOSE. `next build` imports every route module during "Collecting
// page data" to read its config exports, which used to evaluate this file —
// constructing the client and throwing on a missing DATABASE_URL before a
// single request existed. A build must not need database config at all, and a
// route added later must not be able to reintroduce that coupling.
//
// The proxy defers createAdapter()/createPrisma() to the first property access,
// so the failure mode is unchanged in substance — same error, same loudness —
// just relocated from import time to first query. Singleton semantics and the
// dev globalThis cache are preserved by getClient(); methods are bound to the
// real client so Prisma's internals never see the proxy as `this`.
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
      // The proxy target is a plain `{}`, so a non-configurable descriptor from
      // the real client would violate the invariant check and throw.
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

// Neon's serverless pool can occasionally fail to hand out a connection in time
// under concurrent load, which Prisma surfaces as P2028 "Unable to start a
// transaction in the given time." That specific failure happens before the
// transaction body ever runs, so retrying the whole thing is safe — nothing
// has been written yet.
//
// P2028 is also used for other transaction-manager errors (e.g. a transaction
// that expired mid-flight after actually starting) that must NOT be blindly
// retried here — the transaction body already ran partway, and re-running it
// under the same contention would add load rather than relieve it. Match on
// the specific message rather than the code alone.
//
// A DROPPED WEBSOCKET IS ALSO RETRIED, BUT ONLY OUTSIDE THE COMMIT WINDOW.
//
// neon-ws.ts turns a dropped socket into a normal Error that
// `isNeonSocketDropError` recognises. Retrying one is safe in every case but
// ONE, and the exception is the whole reason for the flag below:
//
//   drop BEFORE the callback is entered   -> BEGIN never succeeded, nothing ran.
//   drop WHILE the callback is running    -> the transaction is open and
//                                            uncommitted; when the connection
//                                            dies Postgres rolls it back. Even a
//                                            write whose acknowledgement was lost
//                                            is inside that rollback.
//   drop AFTER the callback RETURNED      -> COMMIT is in flight. We cannot tell
//                                            "it never arrived" from "it
//                                            committed and the ack was lost", so
//                                            a retry here would apply the whole
//                                            body TWICE.
//
// Only the third case is ambiguous, and it is exactly the case `bodyCompleted`
// excludes. This wrapper carries every payment, settlement and ledger write, so
// the ambiguous window fails loudly rather than risking a double-charge; the
// other two — which is where a mid-batch transport blip actually lands — retry.
const TRANSACTION_START_RETRIES = 2;
const TRANSACTION_RETRY_DELAY_MS = 300;

function isTransactionStartTimeout(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2028" &&
    err.message.includes("Unable to start a transaction in the given time")
  );
}

// `isNeonSocketDropError` alone is NOT enough here, and the difference was only
// visible against a live database: when the TCP socket is destroyed, the driver
// that wins the race to reject the in-flight query is pg's own connection
// bookkeeping — a bare `Error: Connection terminated unexpectedly`, with no
// code and no cause — not the WebSocket "error" event that neon-ws.ts
// normalizes. Matching only our own marker would have produced a retry that
// looked correct and never once fired.
//
// These are other people's strings, which is a weaker contract than the marker;
// that is acceptable ONLY because `bodyCompleted` — not this predicate — is
// what protects the COMMIT window. Widening what counts as a transport failure
// cannot widen the double-apply risk.
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
    // Per-attempt, and set SYNCHRONOUSLY the instant the body resolves: from
    // that point on any failure belongs to COMMIT and must not be retried.
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
