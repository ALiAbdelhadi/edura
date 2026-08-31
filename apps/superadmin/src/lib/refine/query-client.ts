import type { HttpError } from "@refinedev/core";

const MAX_TRANSIENT_RETRIES = 1;

function isClientError(error: unknown): boolean {
  const status = (error as HttpError | undefined)?.statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

export const reactQueryClientConfig = {
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst" as const,
      retry: (failureCount: number, error: unknown) =>
        !isClientError(error) && failureCount < MAX_TRANSIENT_RETRIES,
    },
    mutations: {
      networkMode: "offlineFirst" as const,
      retry: false,
    },
  },
};
