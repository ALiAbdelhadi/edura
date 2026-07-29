"use client";

import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Sheet, ledgerMono, ledgerShellScope } from "@/components/ledger";
import { GraduationCap } from "lucide-react";
import { Suspense, type ReactNode } from "react";

/**
 * The single-column auth shell (password reset flows), under the Ledger.
 *
 * Paper canvas, one `--sheet` card, brand block above it. Same treatment as
 * AuthShell so a user who clicks "Forgot password?" does not cross a design
 * boundary mid-flow — which is exactly what would have happened had login been
 * converted and these left behind.
 */
export function AuthCenteredShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${ledgerMono.variable} ${ledgerShellScope} relative flex min-h-dvh flex-col`}
      style={{ background: "var(--paper)" }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
          >
            <GraduationCap aria-hidden className="size-4" />
          </span>
          <span className="text-[15px] font-bold leading-none" style={{ color: "var(--ink)" }}>
            Edura
          </span>
        </div>
        {/* Suspense because the switcher reads useSearchParams(). */}
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm">
          <Sheet className="p-6 sm:p-7">{children}</Sheet>
        </div>
      </main>
    </div>
  );
}
