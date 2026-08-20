"use client";

import React from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Chip,
  Eyebrow,
  LedgerButton,
  Num,
  Sheet,
  ledgerMono,
  ledgerScope,
  ledgerShellScope,
} from "@/components/ledger";

/**
 * The onboarding wizard chrome, under the Ledger.
 *
 * OWNERSHIP NOTE: this shell is shared by the student, teacher and center
 * wizards, and as of this pass all three bodies are on the Ledger primitives
 * too — the split where student used <Sheet>/<LedgerButton> while teacher and
 * center still used the shadcn Button/Badge/`text-muted-foreground` set is
 * closed. One screen, one vocabulary.
 *
 * BOTH SCOPES, deliberately. `ledgerShellScope` re-points the legacy semantic
 * tokens; `ledgerScope` is the one that carries the focus-visible ring, the
 * @repo/ui `data-slot` re-skin (inputs, badges, buttons) and the
 * prefers-reduced-motion guard. Onboarding carried only the first, so a
 * keyboard user got no focus ring on the ONE screen where every control is
 * reached by keyboard, and the center wizard's inputs rendered off-system.
 *
 * HIERARCHY: the step's QUESTION is the headline and the step's NAME is the
 * eyebrow above it — not the other way round. The two say nearly the same
 * thing ("المرحلة" / "إنت في أنهي مرحلة؟"); making the question the h1 means
 * the largest text on screen is the thing the reader has to answer.
 *
 * PROGRESS: a segmented stepper, not a bar. A bar says "roughly this far"; a
 * student abandoning here ends up with no subjects at all, so the screen states
 * exactly which step this is and how many remain.
 *
 * NO EXIT AFFORDANCE, deliberately: the server-side portal gate
 * (lib/auth/portal-gate.ts) redirects any dashboard route back here until
 * onboarding completes, so an "exit" button would loop. What is true and worth
 * saying is that the draft is saved on every step — the recoverable exit,
 * stated rather than faked.
 */
export function WizardShell({
  eyebrow,
  question,
  trail,
  current,
  total,
  onBack,
  children,
  footer,
}: {
  /** The step's name — the small label. */
  eyebrow: string;
  /** The step's question — the headline. */
  question: string;
  /** What has been chosen so far, so the reader keeps their bearings. */
  trail?: string[];
  current: number;
  total: number;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <div
      className={`${ledgerMono.variable} ${ledgerShellScope} ${ledgerScope} min-h-dvh`}
      style={{ background: "var(--paper)" }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-8">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <LedgerButton
              onClick={onBack}
              disabled={!onBack}
              className={onBack ? "" : "invisible"}
            >
              <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
              {t("onboarding.back")}
            </LedgerButton>
            {/* FIGURES ONLY in the mono face. The old shell put the whole
                sentence — "خطوة 1 من 3" — inside <Num>, which is both of the
                traps the system warns about: IBM Plex Mono ships no Arabic, so
                the words fell to an unnamed fallback family with no error, and
                the dir="ltr" isolation reorders an Arabic sentence. The
                sentence itself is not lost: it is the <ol>'s aria-label
                below, which is where a screen reader reads it anyway. */}
            <Num aria-hidden style={{ color: "var(--ink-3)", fontSize: 12 }}>
              {current}/{total}
            </Num>
          </div>

          {/* Each step is its own mark, so "how many left" is countable rather
              than estimated from a bar's width. Done steps keep the indigo but
              drop to a hairline height — behind you, not ahead of you. */}
          <ol
            className="flex items-center gap-1.5"
            aria-label={t("onboarding.stepOf", { current, total })}
          >
            {Array.from({ length: total }, (_, i) => {
              const done = i + 1 < current;
              const active = i + 1 === current;
              return (
                <li
                  key={i}
                  aria-current={active ? "step" : undefined}
                  className="flex-1 rounded-full transition-colors"
                  style={{
                    height: active ? 4 : 3,
                    background:
                      done || active ? "var(--indigo)" : "var(--rule)",
                    opacity: done ? 0.4 : 1,
                  }}
                />
              );
            })}
          </ol>

          <div className="space-y-1.5">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1
              className="text-xl font-semibold sm:text-[22px]"
              style={{ color: "var(--ink)" }}
            >
              {question}
            </h1>
          </div>

          {/* The decisions already made, carried forward. Without this the
              reader on step 4 has no way to check what they picked on step 2
              short of walking back through the wizard. */}
          {trail && trail.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {trail.map((value, i) => (
                <Chip key={`${value}-${i}`} tone="neutral">
                  {value}
                </Chip>
              ))}
            </div>
          ) : null}
        </header>

        <main className="flex-1">{children}</main>

        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          {t("onboarding.progressSaved")}
        </p>

        {footer ? (
          /* A real edge. The old sticky footer had none, so a long list
             scrolled underneath it with nothing to say the page continued. */
          <footer
            className="sticky bottom-0 -mx-4 px-4 pt-3"
            style={{
              background: "var(--paper)",
              borderTop: "1px solid var(--rule)",
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The forward control, with the reason it is unavailable.
 *
 * A disabled button that never says why is the wizard's oldest defect: the
 * count lived INSIDE the CTA as a badge, and "why can't I continue" was left
 * to be inferred. The count now sits beside the list it counts, and the
 * blocking condition is written out — using `onboarding.errors.*`, strings
 * that already existed in both languages and were never rendered.
 */
export function WizardActions({
  label,
  onClick,
  disabled = false,
  hint,
  busy = false,
  icon,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Why the control is unavailable. Shown only while it is. */
  hint?: string;
  busy?: boolean;
  icon?: React.ReactNode;
  /** "secondary" for a footer whose action is the side path, e.g. Skip. */
  variant?: "primary" | "secondary";
}) {
  return (
    <div className="grid gap-2">
      {disabled && hint ? (
        <p
          className="text-center text-xs"
          style={{ color: "var(--ink-2)" }}
          role="status"
        >
          {hint}
        </p>
      ) : null}
      <LedgerButton
        variant={variant}
        className="min-h-12 w-full"
        onClick={onClick}
        disabled={disabled || busy}
      >
        {icon}
        {label}
      </LedgerButton>
    </div>
  );
}

/**
 * The count of what is chosen, next to the thing being counted.
 *
 * NOT in the mono figure face, deliberately: these strings are sentences with
 * a number in them ("{count} صف"), and the mono face carries no Arabic. The
 * bidi algorithm places the numeral correctly inside RTL prose on its own, so
 * no dir override either.
 */
export function WizardCount({ children }: { children: string }) {
  return (
    <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
      {children}
    </span>
  );
}

/**
 * A step that cannot be completed because the catalog returned nothing.
 *
 * The previous wizard rendered `list.map(...)` with no empty branch on four of
 * its steps, so an empty catalog left the student on a blank screen with a
 * Back button and no explanation — the trap this state exists to close. It
 * names what is missing, says the step cannot proceed without it, and offers
 * the only action that can help from here.
 */
export function WizardEmpty({
  title,
  onRetry,
}: {
  title: string;
  onRetry?: () => void;
}) {
  const t = useTranslations();
  return (
    <Sheet className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </p>
      <p
        className="max-w-[46ch] text-xs leading-relaxed"
        style={{ color: "var(--ink-2)" }}
      >
        {t("onboarding.empty.blockedHint")}
      </p>
      {onRetry ? (
        <LedgerButton onClick={onRetry} className="mt-1">
          <RotateCcw className="size-4" aria-hidden />
          {t("onboarding.empty.retry")}
        </LedgerButton>
      ) : null}
    </Sheet>
  );
}

/** The wizard's own loading shape, on Ledger surfaces rather than shadcn's. */
export function WizardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto grid max-w-2xl gap-3 px-4 py-16">
      <div
        className="h-7 w-2/3 animate-pulse rounded-lg"
        style={{ background: "var(--rule-2)" }}
      />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl"
          style={{ background: "var(--rule-2)" }}
        />
      ))}
    </div>
  );
}

/** A single-choice row. Choosing it advances the wizard, so it reads as one. */
export function OptionCard({
  title,
  subtitle,
  icon,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl p-4 text-start transition-colors"
      style={{
        background: selected ? "var(--indigo-soft)" : "var(--sheet)",
        border: `1px solid ${selected ? "var(--indigo)" : "var(--rule)"}`,
        boxShadow: selected ? "inset 3px 0 0 var(--indigo)" : "var(--lift)",
      }}
    >
      {icon ? (
        <span
          style={{ color: selected ? "var(--indigo)" : "var(--ink-2)" }}
          className="[&_svg]:size-6"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className="block font-semibold"
          style={{ color: selected ? "var(--indigo)" : "var(--ink)" }}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="block text-sm" style={{ color: "var(--ink-2)" }}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {/* Selection carried by colour alone fails anyone who cannot separate
          indigo from ink. The mark is the second channel. */}
      {selected ? (
        <Check
          className="size-5 shrink-0"
          style={{ color: "var(--indigo)" }}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

/**
 * A multi-choice chip. Same second channel as OptionCard, and a 44px minimum
 * height — these are tapped in rows of twenty by someone standing at a counter.
 */
export function OptionChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
      style={{
        background: selected ? "var(--indigo)" : "var(--sheet)",
        color: selected ? "var(--indigo-ink)" : "var(--ink-2)",
        border: `1px solid ${selected ? "var(--indigo)" : "var(--rule)"}`,
      }}
    >
      {selected ? <Check className="size-3.5" aria-hidden /> : null}
      {label}
    </button>
  );
}

/** Kept for the eyebrow-labelled groupings the wizards use. */
export { Eyebrow };
