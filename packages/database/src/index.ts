// =============================================================================
// @repo/database — the ONLY package that imports Prisma directly.
// Consumers import the typed client, tenant helpers, request-context, domain
// query functions, and derived types from here.
// =============================================================================

export {
  prisma,
  withTenant,
  withPlatformContext,
  Prisma,
  type ExtendedPrismaClient,
  type TenantTx,
  type TxOptions,
} from "./client";

export { runWithContext, getRequestContext, type RequestContext } from "./context";

export * from "./types";

// Domain-grouped query functions (auth, lessons, finance, points, …) live under
// ./queries and are re-exported here as they are implemented.
export * as queries from "./queries/index";
