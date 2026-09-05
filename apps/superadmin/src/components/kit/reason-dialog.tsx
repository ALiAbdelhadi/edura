"use client";

import type * as React from "react";
import { useTranslations } from "next-intl";

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
import type { LocalizedApiError } from "@repo/ui/lib/api-error";

import {
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { Spinner } from "@/components/kit/spinner";

/**
 * A commit that costs a typed reason. Distinct from ConfirmDialog on purpose:
 * where an action is audited and reversible-by-a-human, the reason IS the
 * audit, so the dialog stays open until one is written and stays open again if
 * the write fails.
 *
 * `onConfirm` must REJECT on failure — that is what keeps the dialog open on
 * the row that failed instead of closing over the error.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  destructive = true,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  /** Extra fields shown above the reason box. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("actions");

  const fields: FieldSpec[] = [
    {
      name: "reason",
      label: t("reasonLabel"),
      type: "textarea",
      rows: 3,
      required: true,
      maxLength: 500,
      autoFocus: true,
    },
  ];

  // Confirm used to be disabled until something was typed, which told the
  // operator nothing about why it was dead. It is reachable now and the
  // schema says what is missing, under the box.
  const { form, submit, rootError } = useFieldForm({
    fields,
    open,
    onSubmit: async (v) => {
      try {
        await onConfirm(String(v.reason).trim());
        onOpenChange(false);
      } catch (e) {
        // `onConfirm` rejects on failure, and that is the contract that keeps
        // this dialog open on the row that failed. Returning the error rather
        // than swallowing it also lets a 422 land on the reason box.
        return { ok: false, error: e as LocalizedApiError };
      }
    },
  });

  const busy = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>

            <FormRootError message={rootError} />
            {children}
            <FieldControls fields={fields} form={form} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                variant={destructive ? "destructive" : "default"}
                disabled={busy}
              >
                {busy ? <Spinner /> : null}
                {confirmText}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
