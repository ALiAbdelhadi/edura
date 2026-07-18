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

export function useOnboarding<TState>() {
  const [tree, setTree] = useState<CatalogSystem[] | null>(null);
  const [state, setState] = useState<TState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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
