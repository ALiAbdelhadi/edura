"use client";

import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { ShieldAlert } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/kit/spinner";

export function ControlAction({
  label,
  title,
  description,
  confirmText,
  url,
  method = "post",
  values,
  requireReason = false,
  destructive = false,
  disabled = false,
  size = "sm",
  onDone,
}: {
  label: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  url: string;
  method?: "post" | "patch" | "put" | "delete";
  values: Record<string, unknown>;
  requireReason?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  size?: "sm" | "default";
  onDone?: () => void;
}) {
  const t = useTranslations("oversight");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { mutateAsync } = useCustomMutation();

  const canSubmit = !requireReason || reason.trim().length > 0;

  const run = async () => {
    if (!canSubmit) {
      toast.error(t("reasonRequiredToast"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url,
        method,
        values: { ...values, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      toast.success(t("actionDone"));
      setOpen(false);
      setReason("");
      onDone?.();
    } catch {
      toast.error(t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant={destructive ? "destructive" : "outline"}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {destructive ? <ShieldAlert className="size-4 text-red" /> : null}
              {title}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">{description}</div>
            </DialogDescription>
          </DialogHeader>

          <label className="space-y-1 text-sm">
            <span className="font-medium">
              {t("reason")}{" "}
              {requireReason ? (
                <span className="text-red" aria-hidden="true">
                  *
                </span>
              ) : (
                t("reasonOptional")
              )}
            </span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              rows={3}
            />
          </label>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={run}
              disabled={busy || !canSubmit}
            >
              {busy ? <Spinner /> : null}
              {confirmText ?? t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
