"use client";

import { Suspense, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

/**
 * Centered single-column frame for the standalone auth pages that don't use the
 * split-screen `AuthShell` (forgot-password / reset-password).
 *
 * It exists so the locale toggle lives in ONE place: those pages render several
 * different states (form, link-sent, invalid-token, done) and each state is its
 * own top-level return, so inlining the switcher would mean repeating it in
 * every branch — and dropping it from any branch the moment one is added.
 *
 * Presentation only. The toggle is absolutely positioned so it adds no height
 * and the card stays optically centered exactly as before.
 */
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
