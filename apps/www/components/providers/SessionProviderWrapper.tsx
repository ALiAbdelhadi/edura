"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function SessionProviderWrapper({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
