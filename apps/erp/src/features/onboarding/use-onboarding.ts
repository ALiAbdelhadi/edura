"use client";

import { api } from "@/lib/api/client";
import { QUERY_FRESHNESS } from "@/lib/refine";
import { useCustom } from "@refinedev/core";
import { useCallback, useRef, useState } from "react";
import type { CatalogSystem } from "./types";

const apiPath = (url: string) => url.replace(/^\/api\/v1\//, "");

export async function apiSend<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const send = method === "POST" ? api.post : api.patch;
  const res = await send(apiPath(url), { json: body }).json<{ data: T }>();
  return res.data;
}

export type OnboardingInitial<TState> = { tree: CatalogSystem[]; state: TState };

export function useOnboarding<TState>(initial?: OnboardingInitial<TState>) {
  const prefetched = initial != null;
  const { query: treeQuery, result: treeResult } = useCustom({
    url: "catalog/tree",
    method: "get",
    queryOptions: { ...QUERY_FRESHNESS.reference, enabled: !prefetched },
  });
  const { query: stateQuery, result: stateResult } = useCustom({
    url: "me/onboarding",
    method: "get",
    queryOptions: { enabled: !prefetched },
  });

  const tree = initial?.tree ?? (treeResult?.data as CatalogSystem[] | undefined) ?? null;
  const state = initial?.state ?? (stateResult?.data as TState | undefined) ?? null;
  const failure = treeQuery.error ?? stateQuery.error;
  const error = prefetched || !failure ? null : failure.message || "failed";

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
