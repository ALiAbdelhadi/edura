"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Form } from "@repo/ui/components/form";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/kit/spinner";
import {
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";

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

  // The error message is localized by the api client and often names the real
  // blocker (e.g. an active course), so useAction surfaces it verbatim.
  const { run: submitAction, busy } = useAction({
    url,
    method,
    successMsg: t("actionDone"),
    onSuccess: () => onDone?.(),
  });

  // Required-ness was a toast plus a dead Confirm button; it is on the field
  // now, and the button stays reachable.
  const fields: FieldSpec[] = [
    {
      name: "reason",
      label: requireReason ? t("reason") : `${t("reason")} ${t("reasonOptional")}`,
      type: "textarea",
      rows: 3,
      required: requireReason,
      placeholder: t("reasonPlaceholder"),
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    open,
    onSubmit: async (v) => {
      const reason = String(v.reason ?? "").trim();
      const res = await submitAction({
        values: { ...values, ...(reason ? { reason } : {}) },
      });
      if (res.ok) setOpen(false);
      return res;
    },
  });

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
          <Form {...form}>
            <DialogForm onSubmit={() => void submit()}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {destructive ? <ShieldAlert className="size-4 text-red" /> : null}
                  {title}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">{description}</div>
                </DialogDescription>
              </DialogHeader>

              <FormRootError message={rootError} />
              <FieldControls fields={fields} form={form} />

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant={destructive ? "destructive" : "default"}
                  disabled={busy}
                >
                  {busy ? <Spinner /> : null}
                  {confirmText ?? t("confirm")}
                </Button>
              </DialogFooter>
            </DialogForm>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
