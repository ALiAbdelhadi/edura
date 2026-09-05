"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "@repo/ui/components/sonner";
import type { LocalizedApiError } from "@repo/ui/lib/api-error";
import { localizeApiError } from "@repo/ui/lib/api-error";
import { api } from "../api/client";

export type ActionMethod = "post" | "put" | "patch" | "delete";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LocalizedApiError };

export type ActionInput = {
  /** Overrides `url` for this call — for per-row endpoints. */
  url?: string;
  /** Overrides `method` for this call. */
  method?: ActionMethod;
  /** Request body. Omit for a bodyless POST/DELETE. */
  values?: unknown;
  /** Query string appended to the URL. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Overrides `successMsg` — for actions whose wording depends on the row. */
  successMsg?: string;
  /**
   * Marks which row this call belongs to. While it runs, `busyKey` is this
   * value, so a table can disable exactly the row being acted on.
   */
  key?: string;
};

export type UseActionOptions<T> = {
  url?: string;
  method?: ActionMethod;
  /** Toasted on success. Omit for actions whose only feedback is the refetch. */
  successMsg?: string;
  /**
   * Runs after a successful call, before `run` resolves. This is where query
   * invalidation goes — pass the screen's `refetch`, or Refine's `invalidate`.
   */
  onSuccess?: (data: T, input: ActionInput) => unknown;
  /**
   * Rethrow the error after toasting it. Dialogs whose "stay open on failure"
   * contract is a rejected submit handler need this (see `ReasonDialog`).
   */
  rethrow?: boolean;
};

export function buildActionUrl(url: string, query: ActionInput["query"]): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * The request half of {@link useAction}, without the React state. Exported so
 * the contract that matters — one toast, the server's own Arabic message,
 * unwrapping the `{ data }` envelope — is unit-testable in a node environment.
 */
export async function performAction<T>(
  options: UseActionOptions<T>,
  input: ActionInput,
): Promise<ActionResult<T>> {
  const target = input.url ?? options.url;
  if (!target) throw new Error("useAction: no url given");

  try {
    const verb = input.method ?? options.method ?? "post";
    const body = input.values === undefined ? undefined : { json: input.values };
    const payload = await api[verb](buildActionUrl(target, input.query), body)
      .json<{ data?: T }>()
      .catch((e: unknown) => {
        // A 204 / empty body is a success with nothing to parse.
        if (e instanceof SyntaxError) return {} as { data?: T };
        throw e;
      });
    const data = (payload?.data ?? payload) as T;

    const msg = input.successMsg ?? options.successMsg;
    if (msg) toast.success(msg);
    await options.onSuccess?.(data, input);
    return { ok: true, data };
  } catch (e) {
    const error = localizeApiError(e);
    toast.error(error.message);
    if (options.rethrow) throw error;
    return { ok: false, error };
  }
}

/**
 * The one write path for a client screen: request, success toast, error toast,
 * busy flag, invalidation.
 *
 * It calls `api` (ky) directly rather than Refine's `useCustomMutation`. That
 * is the point, not an implementation detail: Refine's fallback
 * `errorNotification` toasts the failure through the notification provider AND
 * the screen's own catch toasts it again, so every hand-rolled mutation showed
 * the same error twice. There is exactly one toast here.
 *
 * The error text comes from `localizeApiError`, so a 4xx the server explained
 * — a duplicate payment, a wallet that cannot cover a clawback — reaches the
 * operator in Arabic instead of collapsing into a generic "action failed".
 *
 * `run` is re-entrant-safe: a second click while a call is in flight is a
 * no-op, which is what a mutation button wants.
 */
export function useAction<T = unknown>(options: UseActionOptions<T> = {}): {
  run: (input?: ActionInput) => Promise<ActionResult<T>>;
  busy: boolean;
  busyKey: string | null;
} {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const { url, method, successMsg, onSuccess, rethrow } = options;

  const run = useCallback(
    async (input: ActionInput = {}): Promise<ActionResult<T>> => {
      if (inFlight.current) {
        return {
          ok: false,
          error: localizeApiError(new Error("Action already in flight")),
        };
      }
      inFlight.current = true;
      setBusy(true);
      setBusyKey(input.key ?? null);
      try {
        return await performAction<T>(
          { url, method, successMsg, onSuccess, rethrow },
          input,
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
        setBusyKey(null);
      }
    },
    [url, method, successMsg, onSuccess, rethrow],
  );

  return { run, busy, busyKey };
}
