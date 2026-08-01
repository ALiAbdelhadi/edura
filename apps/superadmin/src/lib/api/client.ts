import ky, { isHTTPError } from 'ky';
import type { AfterResponseHook, BeforeErrorHook } from 'ky';

const handle401: AfterResponseHook = ({ response }) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('edura:auth-error', { detail: { status: 401 } }));
  }
};

// The API answers a refusal with `{ error: { code, message } }`, but ky's own
// HTTPError message is only "Request failed with status code 409: POST <url>",
// and callers were reading `error.response.data` — an axios shape ky never
// produces (ky puts the pre-parsed body on `error.data`). So every business
// rule ("this teacher is already registered", "email exists with a different
// role") reached the user as a bare status code. Lift the envelope's message
// onto the error here, once, so every consumer of `api` gets the real reason.
const surfaceApiError: BeforeErrorHook = ({ error }) => {
  if (isHTTPError(error) && typeof error.data === 'object' && error.data !== null) {
    const body = error.data as { error?: { message?: string }; message?: string };
    const message = body.error?.message || body.message;
    if (message) error.message = message;
  }
  return error;
};

export const api = ky.create({
  prefix: '/api/v1',
  timeout: 10000,
  retry: 0,
  hooks: {
    afterResponse: [handle401],
    beforeError: [surfaceApiError],
  },
});
