"use client";

import { cn } from "@repo/ui/lib/utils";
import { Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Num } from "./num";

export function TwoStepCommit({
  label,
  armedLabel,
  hint,
  armedHint,
  onCommit,
  disabled,
  busy,
  resetKey,
  anchor = "inline",
  icon,
}: {
  label: React.ReactNode;
  armedLabel: React.ReactNode;
  hint?: React.ReactNode;
  armedHint?: React.ReactNode;
  onCommit: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  resetKey?: string | number | null;
  anchor?: "inline" | "viewport-bottom";
  icon?: React.ReactNode;
}) {
  const t = useTranslations();
  const [armed, setArmed] = React.useState(false);

  const [seenResetKey, setSeenResetKey] = React.useState(resetKey);
  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setArmed(false);
  }

  React.useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  const body = (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          void onCommit();
        }}
        className={cn(
          "flex h-11.5 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
          "disabled:opacity-50",
          armed
            ? "bg-destructive text-white"
            : "bg-(--indigo) text-(--indigo-ink)",
        )}
      >
        {armed ? <Lock className="size-4" /> : icon}
        {armed ? armedLabel : label}
      </button>
      <p className="m-0 text-center text-[11px] leading-relaxed text-(--ink-2)">
        {armed ? (armedHint ?? t("shared.ledger.armedHint")) : (hint ?? t("shared.ledger.twoStepHint"))}
      </p>
      <p aria-live="assertive" className="sr-only">
        {armed ? t("shared.ledger.armedAnnounce") : ""}
      </p>
    </div>
  );

  if (anchor === "viewport-bottom") {
    return (
      <div
        className={cn(
          "sticky bottom-0 z-10 -mx-4 mt-3 border-t border-(--rule) bg-(--sheet) px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3",
        )}
      >
        {body}
      </div>
    );
  }
  return body;
}

export function FinalityNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive bg-(--red-soft) p-3">
      <Lock className="mt-px size-4 shrink-0 text-destructive" />
      <p className="m-0 text-[12px] leading-relaxed text-destructive">{children}</p>
    </div>
  );
}

export function ClearanceNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-(--rule) bg-(--teal-soft) p-3">
      <ShieldCheck className="mt-px size-4 shrink-0 text-(--teal)" />
      <p className="m-0 text-[12px] leading-relaxed text-(--teal)">{children}</p>
    </div>
  );
}

export function Computation({
  lines,
  totalLabel,
  totalValue,
  currency,
}: {
  lines: { label: React.ReactNode; value: React.ReactNode; tone?: "out" | "neutral" }[];
  totalLabel: React.ReactNode;
  totalValue: React.ReactNode;
  currency?: React.ReactNode;
}) {
  return (
    <div className="lg-field p-3.5">
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-(--ink-2)">{l.label}</span>
            <Num
              className={cn(
                "text-[13px]",
                l.tone === "out" ? "text-destructive" : "text-(--ink-2)",
              )}
            >
              {l.value}
            </Num>
          </div>
        ))}
      </div>
      <div className="lg-total mt-3 flex items-baseline justify-between gap-3 pt-2.5">
        <span className="text-[13px] font-semibold text-(--ink)">{totalLabel}</span>
        <Num className="text-[22px] font-semibold text-(--money)">
          {totalValue}
          {currency ? (
            <span className="ms-1 text-[12px] font-medium text-(--ink-2)">
              {currency}
            </span>
          ) : null}
        </Num>
      </div>
    </div>
  );
}
