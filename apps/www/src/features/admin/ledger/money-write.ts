import { api } from "@/lib/api/client";

/**
 * Timeout for requests that MOVE MONEY.
 *
 * `api` is created with `timeout: 10000` (lib/api/client.ts). That is a sane
 * default for reads — a list that hangs should fail fast so the operator can
 * retry. It is the wrong default for a write that commits a ledger entry.
 *
 * A charge at the counter writes Payment + Transaction + points + notification
 * in one transaction. When the client gives up at 10s the SERVER STILL COMMITS,
 * so the money moves and the UI reports failure — the exact condition that
 * invites a receptionist to charge a family twice. Aborting early does not
 * prevent the write; it only destroys our knowledge of it.
 *
 * 45s is chosen to sit above a cold route compile and a slow mobile connection
 * at a center, while still bounded — an unbounded request would leave the armed
 * button spinning with no way out.
 *
 * Set PER REQUEST rather than on the shared `api` instance: that file is used by
 * all four www portals, and raising their read timeouts is not this session's
 * call. ky merges per-request options over the instance defaults.
 */
export const MONEY_WRITE_TIMEOUT_MS = 45_000;

export type ApiError = {
  status: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  /** True when the client gave up without an answer — the write MAY have landed. */
  indeterminate: boolean;
};

/**
 * Reads the error envelope ky throws.
 *
 * ky's HTTPError carries the raw fetch Response; the envelope
 * (`{ error: { code, message, details } }`) is only readable by consuming it.
 * Refine's data provider flattens errors to `{ message, statusCode }` and drops
 * `code` and `details`, which is why the counter could never see the price the
 * server had already computed.
 *
 * `indeterminate` is the important one for money: a timeout or a dropped
 * connection produces no Response at all, so the caller must NOT report failure
 * without re-reading server state first.
 */
export async function readApiError(err: unknown): Promise<ApiError> {
  const res = (err as { response?: Response })?.response;
  if (!res || typeof res.clone !== "function") {
    return { status: 0, indeterminate: true };
  }
  try {
    const body = (await res.clone().json()) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    return {
      status: res.status,
      code: body.error?.code,
      message: body.error?.message,
      details: body.error?.details,
      indeterminate: false,
    };
  } catch {
    return { status: res.status, indeterminate: false };
  }
}

/** POST a money write with the long timeout. Errors surface as ky HTTPErrors. */
export async function postMoney<T>(url: string, json: unknown): Promise<T> {
  const res = await api
    .post(url, { json, timeout: MONEY_WRITE_TIMEOUT_MS })
    .json<{ data: T }>();
  return res.data;
}
