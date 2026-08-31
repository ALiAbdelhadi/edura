"use client";

import { api } from "@/lib/api/client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogSystem } from "./types";

const apiPath = (url: string) => url.replace(/^\/api\/v1\//, "");

async function apiGet<T>(url: string): Promise<T> {
  const res = await api.get(apiPath(url)).json<{ data: T }>();
  return res.data;
}

export async function apiSend<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const send = method === "POST" ? api.post : api.patch;
  const res = await send(apiPath(url), { json: body }).json<{ data: T }>();
  return res.data;
}

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
  const [draftFailed, setDraftFailed] = useState(false);
  const saveDraft = useCallback((draft: Record<string, unknown>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // The shell tells the user their progress is saved; a swallowed failure
      // here would make that a lie, so the outcome drives that line.
      void apiSend("/api/v1/me/onboarding", "PATCH", { draft })
        .then(() => setDraftFailed(false))
        .catch(() => setDraftFailed(true));
    }, 400);
  }, []);

  return { tree, state, error, saveDraft, draftFailed };
}
