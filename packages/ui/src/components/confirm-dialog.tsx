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

export type CommitLabels = {
  action: React.ReactNode;
  confirm: React.ReactNode;
  hint?: React.ReactNode;
  armedHint?: React.ReactNode;
  armedAnnouncement?: string;
};

export function TwoStepCommit({
  labels,
  onCommit,
  disabled,
  busy,
  icon: Icon,
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

  React.useEffect(() => {
    setArmed(false);
  }, [resetKey]);

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

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: React.ReactNode;
  cancelText?: React.ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
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
