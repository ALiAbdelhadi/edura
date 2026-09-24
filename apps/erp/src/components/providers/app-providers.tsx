"use client";

import { SessionIntegrityGuard } from "@/components/providers/session-integrity-guard";
import { ThemeModeProvider } from "@/components/providers/theme-mode-provider";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { isRtlLocale } from "@/i18n/routing";
import { DirectionProvider } from "@repo/ui/components/direction-provider";
import { Toaster } from "@repo/ui/components/sonner";
import { useLocale } from "next-intl";
import React, { Suspense } from "react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  return (
    <ThemeModeProvider>
      <DirectionProvider dir={dir}>
        {/* Kept from when RefineProvider lived here: six public pages
            (login, register, claim, confirm-email, reset-password,
            invite/accept) call useSearchParams and rely on this boundary. */}
        <Suspense fallback={null}>{children}</Suspense>
        <Toaster
          dir={dir}
          position={dir === "rtl" ? "bottom-left" : "bottom-right"}
        />
        <InstallPrompt />
        <SessionIntegrityGuard />
      </DirectionProvider>
    </ThemeModeProvider>
  );
}
