"use client";

import React from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Eyebrow,
  LedgerButton,
  Num,
  Sheet,
  ledgerMono,
  ledgerShellScope,
} from "@/components/ledger";

/**
 * The onboarding wizard chrome, under the Ledger.
 *
 * OWNERSHIP NOTE: this shell is shared by the student, teacher and center
 * wizards. It carries `ledgerShellScope`, which re-points the legacy semantic
 * tokens, so all three wizards adopt the Ledger from this one file — the
 * teacher and center wizard bodies were NOT edited. That keeps the change out
 * of two other sessions' files while still leaving one coherent design.
 *
 * PROGRESS: the bar is replaced by a segmented stepper. A bar says "roughly
 * this far"; a student abandoning here ends up with no subjects at all, so the
 * screen states exactly which step this is, how many remain, and — critically —
 * that leaving is safe.
 *
 * NO EXIT AFFORDANCE, deliberately: OnboardingGate redirects any dashboard
 * route back here until onboarding completes, so an "exit" button would loop.
 * What is true and worth saying is that the draft is saved on every step, so
 * closing the tab loses nothing. That is the recoverable exit — stated rather
 * than faked.
 */
export function WizardShell({
  title,
  prompt,
  current,
  total,
  onBack,
  children,
  footer,
}: {
  title: string;
  prompt: string;
  current: number;
  total: number;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <div
      className={`${ledgerMono.variable} ${ledgerShellScope} min-h-dvh`}
      style={{ background: "var(--paper)" }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
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
            <Num style={{ color: "var(--ink-2)", fontSize: 12 }}>
              {t("onboarding.stepOf", { current, total })}
            </Num>
          </div>

          {/* Segmented stepper: each step is its own mark, so "how many left"
              is countable rather than estimated from a bar's width. */}
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
                  className="h-1 flex-1 rounded-full"
                  style={{
                    background: done || active ? "var(--indigo)" : "var(--rule)",
                    opacity: done ? 0.45 : 1,
                  }}
                />
              );
            })}
          </ol>

          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--ink)" }}>
              {title}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
              {prompt}
            </p>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          {t("onboarding.progressSaved")}
        </p>

        {footer ? (
          <footer
            className="sticky bottom-0 py-3"
            style={{ background: "var(--paper)" }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
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
      <p className="max-w-[46ch] text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
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
      <span className="min-w-0">
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
    </button>
  );
}

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
      className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
      style={{
        background: selected ? "var(--indigo)" : "var(--sheet)",
        color: selected ? "var(--indigo-ink)" : "var(--ink-2)",
        border: `1px solid ${selected ? "var(--indigo)" : "var(--rule)"}`,
      }}
    >
      {label}
    </button>
  );
}

/** Kept for the eyebrow-labelled groupings the wizards use. */
export { Eyebrow };
