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

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

/**
 * Reads the error envelope ky throws.
 *
 * ky's HTTPError carries the raw fetch Response; the envelope
 * (`{ error: { code, message, details } }`) is what the API refuses with.
 * Refine's data provider flattens errors to `{ message, statusCode }` and drops
 * `code` and `details`, which is why the counter could never see the price the
 * server had already computed.
 *
 * ── READ `error.data`, NOT THE RESPONSE ────────────────────────────────────
 *
 * ky 2.x pre-parses the body onto `error.data` and, in doing so, CONSUMES it:
 * its own docs say "the response body is automatically consumed when populating
 * error.data, so error.response.json() and other body methods will not work".
 * `response.clone()` on a disturbed body throws, so the `.clone().json()` this
 * function used to do landed in the catch below on EVERY refusal — returning a
 * status and nothing else.
 *
 * That was not cosmetic. The counter's `needs_payment` path is a `catch` on
 * `e.code`: with the code stripped, a student whose coverage had lapsed since
 * the screen last read it got a red "check-in failed" instead of the cash step,
 * and the receptionist had no way forward. The clone is kept as a fallback for
 * any caller that throws a bare Response rather than a ky HTTPError.
 *
 * `indeterminate` is the important one for money: a timeout or a dropped
 * connection produces no Response at all, so the caller must NOT report failure
 * without re-reading server state first.
 */
export async function readApiError(err: unknown): Promise<ApiError> {
  const res = (err as { response?: Response })?.response;
  if (!res) return { status: 0, indeterminate: true };

  const preParsed = (err as { data?: unknown })?.data;
  const body =
    preParsed && typeof preParsed === "object"
      ? (preParsed as ErrorEnvelope)
      : await (async () => {
          try {
            return typeof res.clone === "function"
              ? ((await res.clone().json()) as ErrorEnvelope)
              : null;
          } catch {
            return null;
          }
        })();

  if (!body) return { status: res.status, indeterminate: false };
  return {
    status: res.status,
    code: body.error?.code,
    message: body.error?.message,
    details: body.error?.details,
    indeterminate: false,
  };
}

/** POST a money write with the long timeout. Errors surface as ky HTTPErrors. */
export async function postMoney<T>(url: string, json: unknown): Promise<T> {
  const res = await api
    .post(url, { json, timeout: MONEY_WRITE_TIMEOUT_MS })
    .json<{ data: T }>();
  return res.data;
}
