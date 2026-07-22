"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarCheck,
  CreditCard,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

/**
 * Shared split-screen frame for the auth pages. The frame (branding panel +
 * centered form column), the logo and the ambient background are common, but
 * the `variant` gives each page its own identity so login and register read
 * as siblings rather than clones:
 *
 *  - "signin" (default): hero on the inline-start side, indigo "features" list.
 *  - "signup": hero MIRRORED to the opposite side (lg:flex-row-reverse), with a
 *    teal-accented "join in 3 steps" onboarding panel + a "free to join" badge.
 *
 * Presentation only — each page passes its own form / logo header / footer as
 * children. The form column uses `overflow-y-auto` + `m-auto` so it centers
 * when it fits and scrolls without clipping the top when the content is tall.
 */
export function AuthShell({
  children,
  variant = "signin",
}: {
  children: ReactNode;
  variant?: "signin" | "signup";
}) {
  const t = useTranslations();
  const isSignup = variant === "signup";

  return (
    <div
      className={cn(
        "flex min-h-dvh w-full bg-background",
        // Mirror the split for signup so it reads as a distinct page.
        isSignup && "lg:flex-row-reverse",
      )}
    >
      {/* Branding hero — decorative, desktop only. */}
      <aside className="gradient-primary relative hidden w-[45%] shrink-0 flex-col justify-between overflow-hidden p-12 text-primary-foreground lg:flex xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute size-72 rounded-full bg-white/10 blur-3xl"
          style={{ top: "-6rem", insetInlineEnd: "-6rem" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute size-72 rounded-full bg-white/10 blur-3xl"
          style={{ bottom: "-6rem", insetInlineStart: "-6rem" }}
        />

        {/* Logo lockup — common to both variants. */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
              <GraduationCap aria-hidden="true" className="size-6" />
            </span>
            <span className="display text-2xl font-bold tracking-tight">
              Edura
            </span>
          </div>
          <span className="mt-4 block h-1 w-12 rounded-full bg-brand-teal" />
        </div>

        {/* Middle panel — differs per variant. */}
        {isSignup ? (
          <div className="relative max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/15 px-3 py-1 text-xs font-semibold text-brand-teal ring-1 ring-inset ring-brand-teal/30">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {t("auth.heroSignupBadge")}
            </span>
            <h2 className="display mt-4 text-3xl font-bold leading-tight xl:text-4xl">
              {t("auth.heroTaglineSignup")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
              {t("auth.heroSubtitleSignup")}
            </p>
            <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-primary-foreground/60">
              {t("auth.heroStepsTitle")}
            </p>
            <ol className="mt-3 flex flex-col gap-3 text-sm text-primary-foreground/90">
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-brand-teal-foreground shadow-sm">
                  1
                </span>
                {t("auth.heroStep1")}
              </li>
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-brand-teal-foreground shadow-sm">
                  2
                </span>
                {t("auth.heroStep2")}
              </li>
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-brand-teal-foreground shadow-sm">
                  3
                </span>
                {t("auth.heroStep3")}
              </li>
            </ol>
          </div>
        ) : (
          <div className="relative max-w-md">
            <h2 className="display text-3xl font-bold leading-tight xl:text-4xl">
              {t("auth.heroTagline")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
              {t("auth.heroSubtitle")}
            </p>
            <ul className="mt-8 flex flex-col gap-3 text-sm text-primary-foreground/90">
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <CalendarCheck aria-hidden="true" className="size-4" />
                </span>
                {t("auth.heroFeatureAttendance")}
              </li>
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <CreditCard aria-hidden="true" className="size-4" />
                </span>
                {t("auth.heroFeaturePayments")}
              </li>
              <li className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Users aria-hidden="true" className="size-4" />
                </span>
                {t("auth.heroFeatureRoles")}
              </li>
            </ul>
          </div>
        )}

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Edura
        </p>
      </aside>

      {/* Form column */}
      <main className="flex flex-1 overflow-y-auto p-6">
        <div className="m-auto w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
