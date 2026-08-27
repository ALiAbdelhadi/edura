import ky, { isHTTPError } from 'ky';
import type { AfterResponseHook, BeforeErrorHook } from 'ky';

const handle401: AfterResponseHook = ({ response }) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('edura:auth-error', { detail: { status: 401 } }));
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

export const api = ky.create({
  prefix: '/api/v1',
  timeout: 10000,
  retry: 0,
  hooks: {
    afterResponse: [handle401],
    beforeError: [surfaceApiError],
  },
});
