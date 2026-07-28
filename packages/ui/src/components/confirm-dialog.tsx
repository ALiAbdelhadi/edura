"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { Lock } from "lucide-react";
import * as React from "react";

/* The two-step commit — the system's signature interaction.
   ══════════════════════════════════════════════════════════════════════════════

   WHY IT EXISTS, precisely: it makes irreversibility FELT at the moment it occurs.
   That is a stronger reason than "it prevents mistakes", and it has a sharp corollary
   —

     APPLYING IT TO A REVERSIBLE ACTION IS DISHONEST. It claims permanence where there
     is none, and every time it is spent on something recoverable it is worth less
     where permanence is real. Marking a lesson complete, sending a message, saving a
     profile: ONE press. Approving a payout, recording cash, paying from a wallet,
     closing a settlement: two.

   It must be IDENTICAL in every portal. A teacher requesting a payout and a superadmin
   approving one are the same class of act seen from two sides; if the ceremony differs
   between them, the ceremony means nothing.

   ── The rules, all load-bearing ──────────────────────────────────────────────

   1. THE BUTTON CARRIES ITS OWN AMOUNT. `اعتماد وصرف 38,235.00 ج.م`, never "Approve".
      An operator authorises a specific number, not a category of action. A button
      reading "Confirm" asks for consent to something unnamed.
   2. ARMING RESETS on row change, route change, Escape, and after commit. A button
      left armed from a previous row is a trap.
   3. THE TRANSITION IS ANNOUNCED. `aria-live` + the label change, so the state is not
      colour-only — a red fill communicates nothing to a screen reader.
   4. `touch` ANCHORS THE ARMED BUTTON to the bottom of the viewport, thumb-reachable.
      Same ceremony, different ergonomics — which is why it is a PROP here and not a
      forked component at the counter. */

export type CommitLabels = {
  /** Unarmed label. MUST contain the amount. */
  action: React.ReactNode;
  /** Armed label, e.g. `تأكيد نهائي — اضغط للصرف`. */
  confirm: React.ReactNode;
  /** Hint under the unarmed button. */
  hint?: React.ReactNode;
  /** Hint under the armed button — say what will be written, and in whose name. */
  armedHint?: React.ReactNode;
  /** Announced to assistive tech when the button arms. */
  armedAnnouncement?: string;
};

export function TwoStepCommit({
  labels,
  onCommit,
  disabled,
  busy,
  icon: Icon,
  /** Anything that identifies the current subject. Arming resets when it changes. */
  resetKey,
  density = "compact",
  className,
}: {
  labels: CommitLabels;
  onCommit: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  resetKey?: unknown;
  density?: "compact" | "touch";
  className?: string;
}) {
  const [armed, setArmed] = React.useState(false);

  // Rule 2 — reset on subject change. `resetKey` is typically the selected row id.
  React.useEffect(() => {
    setArmed(false);
  }, [resetKey]);

  // Rule 2 — Escape disarms, wherever focus happens to be.
  React.useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  const press = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      await onCommit();
    } finally {
      setArmed(false); // Rule 2 — never leave a committed button armed.
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        // Rule 4 — at the counter the armed button must be under the thumb.
        density === "touch" &&
          armed &&
          "sticky bottom-0 z-20 -mx-4 border-t border-rule bg-sheet px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <Button
        type="button"
        onClick={press}
        disabled={disabled || busy}
        aria-live="polite"
        className={cn(
          "w-full justify-center gap-2 font-semibold",
          density === "touch" ? "h-14 text-base" : "h-[46px]",
          armed
            ? "bg-red text-indigo-ink hover:bg-red/90"
            : "bg-indigo text-indigo-ink hover:bg-indigo/90",
        )}
      >
        {armed ? (
          <Lock className="size-4" aria-hidden="true" />
        ) : Icon ? (
          <Icon className="size-4" aria-hidden="true" />
        ) : null}
        {armed ? labels.confirm : labels.action}
      </Button>

      {/* Rule 3 — the state change is announced, not merely coloured. */}
      <span className="sr-only" role="status" aria-live="assertive">
        {armed ? (labels.armedAnnouncement ?? "") : ""}
      </span>

      {armed ? labels.armedHint ? (
        <p className="text-xs text-red">{labels.armedHint}</p>
      ) : null : labels.hint ? (
        <p className="text-xs text-ink-3">{labels.hint}</p>
      ) : null}
    </div>
  );
}

/* <ConfirmDialog> — the ONE-press confirmation, for REVERSIBLE destructive actions
   (removing a draft, cancelling an unsent invite). Kept because the app has 12 call
   sites that are genuinely reversible.

   If the action writes to the ledger, this is the wrong component. Use TwoStepCommit. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: React.ReactNode;
  cancelText?: React.ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? cn(buttonVariants({ variant: "destructive" })) : undefined}
            onClick={onConfirm}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
