import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient, Prisma } from "./generated/client/index";
import {
  softDeleteExtension,
  immutableExtension,
  auditLogExtension,
} from "./extensions/index";

// Neon's serverless driver talks over WebSockets. In Node (where this client
// runs) wire the `ws` constructor. Guard against edge, where importing `ws`
// wouldn't apply and a global WebSocket already exists.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Point it at the Neon POOLED connection string.",
  );
}

function createPrisma() {
  const adapter = new PrismaNeon({ connectionString });
  const base = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
  // Order: soft-delete + immutability guard first, audit-log last so it records
  // the effective mutation.
  return base
    .$extends(softDeleteExtension)
    .$extends(immutableExtension)
    .$extends(auditLogExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createPrisma>;

// The client shape available inside an interactive transaction (extensions
// applied, transaction-control methods removed — Prisma's ITX deny list).
export type TenantTx = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// Dev-mode global caching so Next.js hot-reload doesn't exhaust the pool.
const globalForPrisma = globalThis as unknown as {
  __edura_prisma?: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient =
  globalForPrisma.__edura_prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__edura_prisma = prisma;
}

/**
 * Run a unit of work inside a transaction whose Postgres session is pinned to a
 * tenant, so Row-Level Security policies (which read
 * `current_setting('app.current_center_id')`) enforce isolation at the DB layer.
 *
 * The `set_config(..., true)` scopes the setting to THIS transaction only, which
 * is required when running over a shared/pooled connection.
 *
 * App-layer RBAC (requireRole / requireCenterScope) still applies on top as
 * defense-in-depth — this is the second, DB-enforced layer.
 */
export type TxOptions = { maxWait?: number; timeout?: number };

// Serverless/WebSocket links to Neon can be slow on cold start; give interactive
// transactions a generous default. Override per call for long-running work.
const DEFAULT_TX_OPTIONS: Required<TxOptions> = { maxWait: 10_000, timeout: 20_000 };

export async function withTenant<T>(
  centerId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_center_id', ${centerId}, true)`;
    return fn(tx);
  }, { ...DEFAULT_TX_OPTIONS, ...options });
}

/**
 * Run a unit of work as the platform (super_admin / accountant / cross-tenant
 * jobs like the money-distribution engine). Sets `app.bypass_rls = 'on'` for the
 * transaction; RLS policies allow full access when this flag is set.
 */
export async function withPlatformContext<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  }, { ...DEFAULT_TX_OPTIONS, ...options });
}

export { Prisma };
export * from "./generated/client/index";
