"use client";

import { api } from "@/lib/api/client";
import { useEffect, useState } from "react";

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
        // Deliberately fails OPEN: a probe blip must not silently remove the
        // only way to pay. The button stays, and a real attempt now surfaces a
        // localized error instead of vanishing without explanation.
      });
    return () => {
      alive = false;
    };
  }, []);
  return online;
}
