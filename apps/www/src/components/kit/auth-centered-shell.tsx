"use client";

import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Suspense, type ReactNode } from "react";

export function AuthCenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      {/* Suspense because the switcher reads useSearchParams(). */}
      <div className="absolute inset-x-0 top-0 flex justify-end p-6">
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
