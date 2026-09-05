import { AsyncLocalStorage } from "node:async_hooks";

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

export type AuditTx = {
  $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
  auditLog: { create: (a: unknown) => Promise<unknown> };
};

const txStorage = new AsyncLocalStorage<AuditTx>();

export function runWithAuditTx<T>(tx: AuditTx, fn: () => T): T {
  return txStorage.run(tx, fn);
}

export function getAuditTx(): AuditTx | undefined {
  return txStorage.getStore();
}
