"use client";

import { cn } from "@repo/ui/lib/utils";
import { Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Num } from "./num";

/**
 * Two-step commit — the system's signature interaction.
 *
 * Because the write is irreversible, the button carries its own amount and costs
 * two presses. Unarmed it is indigo and states what it will do including the
 * figure; armed it turns red, the icon becomes a lock, and the label says the
 * next press is final.
 *
 * Arming resets on: Escape, unmount, `resetKey` change (row/route change), and
 * after commit. The transition is announced via a live region — an armed state
 * a screen-reader user cannot perceive is not a confirmation step.
 *
 * `anchor="viewport-bottom"` is the counter ergonomic: same ceremony, thumb
 * reach. A receptionist is standing with a phone in one hand.
 */
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
  /** Must name the amount, e.g. "تحصيل 50.00 ج.م". */
  label: React.ReactNode;
  armedLabel: React.ReactNode;
  hint?: React.ReactNode;
  armedHint?: React.ReactNode;
  onCommit: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  /** Change this to force disarm — the selected row id, the route, anything. */
  resetKey?: string | number | null;
  anchor?: "inline" | "viewport-bottom";
  icon?: React.ReactNode;
}) {
  const t = useTranslations();
  const [armed, setArmed] = React.useState(false);

  // Disarm DURING render, not in an effect. An effect runs after paint, which
  // would leave one frame where the armed red button is showing while the panel
  // already displays a different row — on a money action that frame is a
  // mis-click waiting to happen. This is React's documented pattern for
  // adjusting state when a prop changes.
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
          "flex h-[46px] w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
          "disabled:opacity-50",
          armed
            ? "bg-[var(--red)] text-white"
            : "bg-[var(--indigo)] text-[var(--indigo-ink)]",
        )}
      >
        {armed ? <Lock className="size-4" /> : icon}
        {armed ? armedLabel : label}
      </button>

      <p className="m-0 text-center text-[11px] leading-relaxed text-[var(--ink-2)]">
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
          "sticky bottom-0 z-10 -mx-4 mt-3 border-t border-[var(--rule)] bg-[var(--sheet)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3",
        )}
      >
        {body}
      </div>
    );
  }
  return body;
}

/**
 * The red irreversibility notice that must sit above every commit. States what
 * becomes permanent and what the only correction is.
 */
export function FinalityNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--red)] bg-[var(--red-soft)] p-3">
      <Lock className="mt-px size-4 shrink-0 text-[var(--red)]" />
      <p className="m-0 text-[12px] leading-relaxed text-[var(--red)]">{children}</p>
    </div>
  );
}

/** The teal clearance advisory — what was checked before this became committable. */
export function ClearanceNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--rule)] bg-[var(--teal-soft)] p-3">
      <ShieldCheck className="mt-px size-4 shrink-0 text-[var(--teal)]" />
      <p className="m-0 text-[12px] leading-relaxed text-[var(--teal)]">{children}</p>
    </div>
  );
}

/**
 * تفصيل الحساب — the computation, shown in full before the commit. Every
 * intermediate figure is visible; nothing is pre-summed. Closes on the
 * double-rule total.
 */
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
            <span className="text-[12px] text-[var(--ink-2)]">{l.label}</span>
            <Num
              className={cn(
                "text-[13px]",
                l.tone === "out" ? "text-[var(--red)]" : "text-[var(--ink-2)]",
              )}
            >
              {l.value}
            </Num>
          </div>
        ))}
      </div>
      <div className="lg-total mt-3 flex items-baseline justify-between gap-3 pt-2.5">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{totalLabel}</span>
        <Num className="text-[22px] font-semibold text-[var(--money)]">
          {totalValue}
          {currency ? (
            <span className="ms-1 text-[12px] font-medium text-[var(--ink-2)]">
              {currency}
            </span>
          ) : null}
        </Num>
      </div>
    </div>
  );
}
