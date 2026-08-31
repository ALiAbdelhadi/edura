import { localizeApiError } from '@repo/ui/lib/api-error';
import ky from 'ky';
import type { AfterResponseHook, BeforeErrorHook, KyInstance, ResponsePromise } from 'ky';

const handle401: AfterResponseHook = ({ response }) => {
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('edura:auth-error', { detail: { status: 401 } }));
  }
};

const localizeError: BeforeErrorHook = ({ error }) => {
  return localizeApiError(error) as typeof error;
};

const raw = ky.create({
  prefix: '/api/v1',
  timeout: 10000,
  retry: 0,
  hooks: {
    afterResponse: [handle401],
    beforeError: [localizeError],
  },
});

const BODY_METHODS = ['json', 'text', 'blob', 'arrayBuffer', 'formData'] as const;

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
  for (const method of ['get', 'post', 'put', 'patch', 'head', 'delete'] as const) {
    out[method] = (...args: Parameters<KyInstance['get']>) =>
      wrapResponsePromise(instance[method](...args));
  }
  out.extend = instance.extend.bind(instance);
  out.stop = instance.stop;
  return out as unknown as KyInstance;
}

export const api = wrapKy(raw);
