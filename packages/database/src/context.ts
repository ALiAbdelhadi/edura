import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ambient per-request context. The API layer wraps each request in
 * `runWithContext({ actorId, centerId, ipAddress }, handler)` so the audit-log
 * extension can attribute mutations WITHOUT every call site remembering to pass
 * an actor. This is what makes audit logging structural rather than a
 * "remember to call it" convention.
 */
export type RequestContext = {
  actorId?: string;
  centerId?: string;
  ipAddress?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
