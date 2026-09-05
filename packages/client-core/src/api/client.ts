import { localizeApiError } from "@repo/ui/lib/api-error";
import ky from "ky";
import type { AfterResponseHook, BeforeErrorHook, KyInstance, ResponsePromise } from "ky";

export const SESSION_INTEGRITY_EVENT = "edura:session-integrity";

export type SessionIntegrityReason =
  | "session_conflict"
  | "role_mismatch"
  | "session_expired";

function readErrorCode(body: unknown): {
  code?: string;
  reason?: string;
} {
  if (!body || typeof body !== "object") return {};
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return {};
  const { code, details } = error as { code?: string; details?: unknown };
  const reason =
    details && typeof details === "object"
      ? (details as { reason?: string }).reason
      : undefined;
  return { code, reason };
}

const handleSessionIntegrity: AfterResponseHook = async ({ response }) => {
  if (typeof window === "undefined") return;
  if (response.status !== 401 && response.status !== 403) return;

  let reason: SessionIntegrityReason | null = null;
  if (response.status === 401 || response.status === 403) {
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    const { code, reason: detail } = readErrorCode(body);
    if (code === "session_conflict") reason = "session_conflict";
    else if (response.status === 403 && detail === "role_mismatch")
      reason = "role_mismatch";
  }

  if (!reason && response.status === 401) reason = "session_expired";

  if (reason) {
    window.dispatchEvent(
      new CustomEvent(SESSION_INTEGRITY_EVENT, { detail: { reason } }),
    );
  }
};

const localizeError: BeforeErrorHook = ({ error }) => {
  return localizeApiError(error) as typeof error;
};

const READ_TIMEOUT_MS = process.env.NODE_ENV === "development" ? 30000 : 10000;

const raw = ky.create({
  prefix: "/api/v1",
  timeout: READ_TIMEOUT_MS,
  retry: 0,
  hooks: {
    afterResponse: [handleSessionIntegrity],
    beforeError: [localizeError],
  },
});

const BODY_METHODS = ["json", "text", "blob", "arrayBuffer", "formData"] as const;

function rethrowLocalized(error: unknown): never {
  throw localizeApiError(error);
}

function wrapResponsePromise(rp: ResponsePromise): ResponsePromise {
  const passthrough = rp.catch(rethrowLocalized) as unknown as ResponsePromise;
  void (passthrough as Promise<unknown>).catch(() => {});
  for (const method of BODY_METHODS) {
    (passthrough as unknown as Record<string, unknown>)[method] = () =>
      (rp as unknown as Record<string, () => Promise<unknown>>)
        [method]()
        .catch(rethrowLocalized);
  }
  return passthrough;
}

function wrapKy(instance: KyInstance): KyInstance {
  const out: Record<string, unknown> = {};
  for (const method of ["get", "post", "put", "patch", "head", "delete"] as const) {
    out[method] = (...args: Parameters<KyInstance["get"]>) =>
      wrapResponsePromise(instance[method](...args));
  }
  out.extend = instance.extend.bind(instance);
  out.stop = instance.stop;
  return out as unknown as KyInstance;
}

export const api = wrapKy(raw);
