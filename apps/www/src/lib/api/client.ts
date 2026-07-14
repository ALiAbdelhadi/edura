import ky from 'ky';
import type { AfterResponseHook } from 'ky';

const handle401: AfterResponseHook = ({ response }) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('edura:auth-error', { detail: { status: 401 } }));
  }
};

export const api = ky.create({
  prefix: '/api/v1',
  timeout: 10000,
  retry: 0,
  hooks: {
    afterResponse: [handle401],
  },
});
