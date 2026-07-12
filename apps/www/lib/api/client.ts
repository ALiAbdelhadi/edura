import ky from 'ky';
import type { AfterResponseHook } from 'ky';

const handle401: AfterResponseHook = ({ response }) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    // Dispatch a custom event instead of hard-redirecting so components
    // can decide whether the 401 is transient (e.g. SessionProvider hasn't
    // fetched yet) or genuine. A hard window.location redirect here caused
    // infinite refresh loops on the dashboard.
    window.dispatchEvent(new CustomEvent('edura:auth-error', { detail: { status: 401 } }));
  }
};

// Base API client
export const api = ky.create({
  prefix: '/api/v1',
  timeout: 10000,
  retry: 0,
  hooks: {
    afterResponse: [handle401],
  },
});
