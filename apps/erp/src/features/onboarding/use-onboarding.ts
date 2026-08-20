"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogSystem } from "./types";

type Envelope<T> = { data: T } | { error: { code: string; message: string } };

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || "error" in json) throw new Error("error" in json ? json.error.message : "Request failed");
  return json.data;
}

export async function apiSend<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || "error" in json) throw new Error("error" in json ? json.error.message : "Request failed");
  return json.data;
}

/**
 * The wizard's data, either handed to it or fetched.
 *
 * `initial` is the server-rendered path: the page that renders a wizard has
 * already resolved the session to decide whether the wizard should be shown at
 * all, so it loads the catalog tree and the saved state in that same server
 * pass and passes them down. The wizard then paints filled on first render
 * instead of mounting a skeleton and waiting for two more round trips.
 *
 * The fetching path stays for any caller with no server data to give.
 */
export type OnboardingInitial<TState> = { tree: CatalogSystem[]; state: TState };

export function useOnboarding<TState>(initial?: OnboardingInitial<TState>) {
  const [tree, setTree] = useState<CatalogSystem[] | null>(initial?.tree ?? null);
  const [state, setState] = useState<TState | null>(initial?.state ?? null);
  const [error, setError] = useState<string | null>(null);

  const prefetched = initial != null;
  useEffect(() => {
    if (prefetched) return;
    let cancelled = false;
    Promise.all([apiGet<CatalogSystem[]>("/api/v1/catalog/tree"), apiGet<TState>("/api/v1/me/onboarding")])
      .then(([treeData, stateData]) => {
        if (cancelled) return;
        setTree(treeData);
        setState(stateData);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "failed"));
    return () => {
      cancelled = true;
    };
  }, [prefetched]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraft = useCallback((draft: Record<string, unknown>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void apiSend("/api/v1/me/onboarding", "PATCH", { draft }).catch(() => {
      });
    }, 400);
  }, []);

  return { tree, state, error, saveDraft };
}
