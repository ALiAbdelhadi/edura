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
  eyebrow: string;
  question: string;
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
            <Num aria-hidden style={{ color: "var(--ink-3)", fontSize: 12 }}>
              {current}/{total}
            </Num>
          </div>

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
  hint?: string;
  busy?: boolean;
  icon?: React.ReactNode;
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

export function WizardCount({ children }: { children: string }) {
  return (
    <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
      {children}
    </span>
  );
}

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

export { Eyebrow };
