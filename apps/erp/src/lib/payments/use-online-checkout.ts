"use client";

import { api } from "@/lib/api/client";
import { useEffect, useState } from "react";

/**
 * MVP blocker #2 — may the UI offer an online checkout? Defaults to TRUE
 * while loading so the common case (payments available) never flickers a
 * missing button; the initiators assert server-side regardless, so an
 * optimistic frame can never mint a dead charge.
 */
export function useOnlineCheckout(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let alive = true;
    api
      .get("payments/availability")
      .json<{ data: { online: boolean } }>()
      .then((res) => {
        if (alive) setOnline(res.data.online);
      })
      .catch(() => {
        /* on failure keep the optimistic default — the server still guards */
      });
    return () => {
      alive = false;
    };
  }, []);
  return online;
}
