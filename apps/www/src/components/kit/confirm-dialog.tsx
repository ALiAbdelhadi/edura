"use client";

import {
  ConfirmDialog as UIConfirmDialog,
  TwoStepCommit,
  type CommitLabels,
} from "@repo/ui/components/confirm-dialog";
import { useTranslations } from "next-intl";
import * as React from "react";

export { TwoStepCommit, type CommitLabels };

/* Shim → @repo/ui/components/confirm-dialog.
   Injects the default confirm/cancel copy so the 12 existing call sites that omit it
   stop rendering English in an Arabic page.

   NOTE for portal sessions: this dialog is the ONE-press confirmation, for REVERSIBLE
   actions. If the action writes to the ledger, use <TwoStepCommit> instead — see the
   reasoning at the top of the source file. */
export function ConfirmDialog(
  props: React.ComponentProps<typeof UIConfirmDialog>,
) {
  const t = useTranslations("actions");
  return (
    <UIConfirmDialog
      confirmText={props.confirmText ?? t("confirm")}
      cancelText={props.cancelText ?? t("cancel")}
      {...props}
    />
  );
}
