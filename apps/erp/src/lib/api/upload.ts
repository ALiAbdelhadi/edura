"use client";

import { SESSION_INTEGRITY_EVENT } from "@/lib/api/client";
import { localizeApiError } from "@repo/ui/lib/api-error";

// ky's onUploadProgress streams the request body, and Chromium refuses
// streaming bodies over HTTP/1.1 — which is exactly what `next dev` speaks.
// XHR reports upload progress everywhere with no protocol constraint, so
// file uploads that want a progress bar go through here instead.
export function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  options: { timeoutMs: number; onProgress?: (fraction: number) => void },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/${path}`);
    xhr.timeout = options.timeoutMs;
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(e.loaded / e.total);
    };

    xhr.onload = () => {
      const body = xhr.response as { data?: T } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body?.data as T);
        return;
      }
      if (xhr.status === 401 && typeof window !== "undefined") {
        // Mirror the ky client's afterResponse hook so a dead session during
        // an upload still signs the user out instead of failing quietly.
        window.dispatchEvent(
          new CustomEvent(SESSION_INTEGRITY_EVENT, {
            detail: { reason: "session_expired" },
          }),
        );
      }
      reject(
        localizeApiError(
          Object.assign(new Error(`HTTP ${xhr.status}`), {
            response: { status: xhr.status },
            data: body,
          }),
        ),
      );
    };
    xhr.onerror = () => reject(localizeApiError(new TypeError("Failed to fetch")));
    xhr.ontimeout = () =>
      reject(localizeApiError(Object.assign(new Error("Request timed out"), { name: "TimeoutError" })));

    xhr.send(formData);
  });
}
