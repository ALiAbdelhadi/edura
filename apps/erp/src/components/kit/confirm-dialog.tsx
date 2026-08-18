"use client";

import {
  ConfirmDialog as UIConfirmDialog,
  TwoStepCommit,
  type CommitLabels,
} from "@repo/ui/components/confirm-dialog";
import { useTranslations } from "next-intl";
import * as React from "react";

export { TwoStepCommit, type CommitLabels };

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
