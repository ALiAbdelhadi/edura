import ky, { isHTTPError } from 'ky';
import type { AfterResponseHook, BeforeErrorHook } from 'ky';

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
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    const { code, reason: detail } = readErrorCode(body);
    if (code === 'session_conflict') reason = 'session_conflict';
    else if (response.status === 403 && detail === 'role_mismatch')
      reason = 'role_mismatch';
  }

  if (!reason && response.status === 401) reason = 'session_expired';

  if (reason) {
    window.dispatchEvent(
      new CustomEvent(SESSION_INTEGRITY_EVENT, { detail: { reason } }),
    );
  }
};

const surfaceApiError: BeforeErrorHook = ({ error }) => {
  if (isHTTPError(error) && typeof error.data === 'object' && error.data !== null) {
    const body = error.data as { error?: { message?: string }; message?: string };
    const message = body.error?.message || body.message;
    if (message) error.message = message;
  }
  return error;
};

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
