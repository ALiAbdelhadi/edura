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
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return online;
}
