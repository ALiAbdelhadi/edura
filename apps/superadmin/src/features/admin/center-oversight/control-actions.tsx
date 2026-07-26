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
import { Spinner } from "@/components/kit/spinner";

// ---------------------------------------------------------------------------
// Every control operation goes through THIS dialog, so no oversight write can
// happen without the operator seeing what changes and (for anything that cuts
// access or removes data) typing a reason. The reason is stored in the audit
// row's afterState — the log answers "why", not just "what".
// ---------------------------------------------------------------------------

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
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { mutateAsync } = useCustomMutation();

  const canSubmit = !requireReason || reason.trim().length > 0;

  const run = async () => {
    if (!canSubmit) {
      toast.error("A reason is required for this action");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url,
        method,
        values: { ...values, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      toast.success("Done — the action was recorded in the audit log");
      setOpen(false);
      setReason("");
      onDone?.();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Action failed");
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
              {destructive ? <ShieldAlert className="size-4 text-destructive" /> : null}
              {title}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">{description}</div>
            </DialogDescription>
          </DialogHeader>

          <label className="space-y-1 text-sm">
            <span className="font-medium">
              Reason {requireReason ? <span className="text-destructive">*</span> : "(optional)"}
            </span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recorded in the audit log alongside who, what and when."
              rows={3}
            />
          </label>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={run}
              disabled={busy || !canSubmit}
            >
              {busy ? <Spinner /> : null}
              {confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
