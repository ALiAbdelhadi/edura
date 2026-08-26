import { api } from "@/lib/api/client";
export const MONEY_WRITE_TIMEOUT_MS = 45_000;

export type ApiError = {
  status: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  indeterminate: boolean;
};

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

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

export async function postMoney<T>(url: string, json: unknown): Promise<T> {
  const res = await api
    .post(url, { json, timeout: MONEY_WRITE_TIMEOUT_MS })
    .json<{ data: T }>();
  return res.data;
}
