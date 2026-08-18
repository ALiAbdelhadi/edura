import ky, { isHTTPError } from 'ky';
import type { AfterResponseHook, BeforeErrorHook } from 'ky';

/**
 * The three refusals that mean "the session behind this screen is not who the
 * screen says it is", announced once, here, so no individual screen has to know
 * about them.
 *
 *  - 401 `session_conflict` — the request carried more than one session cookie,
 *    so the server refused to guess which person was asking.
 *  - 403 `role_mismatch`    — the session's role is not one this route serves,
 *    which on a role-scoped portal means the session changed underneath it.
 *  - 401 `session_expired`  — the ordinary case: the server does not recognise
 *    this session at all. By far the most common of the three, and until now
 *    the only one with nowhere to go: it was dispatched as a separate
 *    `edura:auth-error` event that NOTHING in the app ever listened for, so an
 *    expired session left every dashboard rendering its loading skeleton for
 *    ever — a screen that says "fetching" about a request that already has its
 *    final answer. One event and one guard now, rather than a second mechanism
 *    beside this one.
 *
 * `SessionIntegrityGuard` listens and resolves it (sign out, then the login
 * screen with a plain sentence). Dispatching rather than acting keeps this
 * module free of navigation and auth imports — it is the transport, not the
 * policy. See docs/reports/session-identity-mismatch.md.
 */
export const SESSION_INTEGRITY_EVENT = 'edura:session-integrity';

export type SessionIntegrityReason =
  | 'session_conflict'
  | 'role_mismatch'
  | 'session_expired';

function readErrorCode(body: unknown): {
  code?: string;
  reason?: string;
} {
  if (!body || typeof body !== 'object') return {};
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return {};
  const { code, details } = error as { code?: string; details?: unknown };
  const reason =
    details && typeof details === 'object'
      ? (details as { reason?: string }).reason
      : undefined;
  return { code, reason };
}

const handleSessionIntegrity: AfterResponseHook = async ({ response }) => {
  if (typeof window === 'undefined') return;
  if (response.status !== 401 && response.status !== 403) return;

  let reason: SessionIntegrityReason | null = null;
  if (response.status === 401 || response.status === 403) {
    // The body is read from a CLONE: the caller still needs the original, and
    // ky's own error path consumes it exactly once.
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    const { code, reason: detail } = readErrorCode(body);
    if (code === 'session_conflict') reason = 'session_conflict';
    else if (response.status === 403 && detail === 'role_mismatch')
      reason = 'role_mismatch';
  }

  // A bare 401 with no code is an expired or absent session. It is a FINAL
  // answer, not a pending one, so it travels on the same channel as the other
  // two — the guard decides what to do with it, including doing nothing on the
  // public pages, where a 401 is simply the truth about a signed-out visitor.
  if (!reason && response.status === 401) reason = 'session_expired';

  if (reason) {
    window.dispatchEvent(
      new CustomEvent(SESSION_INTEGRITY_EVENT, { detail: { reason } }),
    );
  }
};

// The API answers a refusal with `{ error: { code, message } }`, but ky's own
// HTTPError message is only "Request failed with status code 409: POST <url>",
// and callers were reading `error.response.data` — an axios shape ky never
// produces (ky puts the pre-parsed body on `error.data`). So every business
// rule reached the user as a bare status code. Lift the envelope's message onto
// the error here, once, so every consumer of `api` gets the real reason.
const surfaceApiError: BeforeErrorHook = ({ error }) => {
  if (isHTTPError(error) && typeof error.data === 'object' && error.data !== null) {
    const body = error.data as { error?: { message?: string }; message?: string };
    const message = body.error?.message || body.message;
    if (message) error.message = message;
  }
  return error;
};

/**
 * The default read budget.
 *
 * 10s is right in production — a read that has not answered by then is no
 * longer useful to whoever is waiting on it.
 *
 * Dev is not the same request. The FIRST hit on a route under `next dev` also
 * pays Turbopack's on-demand compile of that route's whole module graph (the
 * Prisma client, @repo/server-core, the notification layer), and a Neon branch
 * that has scaled to zero adds its cold start on top — the same cold start that
 * already forced `/api/health`'s bound up to 8s. Both are startup cost, not
 * slowness, and under a 10s budget they surfaced as `TimeoutError: Request timed
 * out: GET …/messages/conversations` on a request that answers in milliseconds
 * the moment it is warm. Give dev the headroom; production keeps the tight one.
 *
 * Per-request overrides still win either way — the money writes' 45s
 * (features/admin/ledger/money-write.ts) and the CSV import's 120s.
 */
const READ_TIMEOUT_MS = process.env.NODE_ENV === 'development' ? 30000 : 10000;

export const api = ky.create({
  prefix: '/api/v1',
  timeout: READ_TIMEOUT_MS,
  retry: 0,
  hooks: {
    afterResponse: [handleSessionIntegrity],
    beforeError: [surfaceApiError],
  },
});
