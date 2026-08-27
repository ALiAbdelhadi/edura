"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { DelegationStrip } from "@repo/ui/components/delegation-strip";

export function AssistantDelegationStrip() {
  const t = useTranslations("delegation");
  const { result } = useCustom({ url: "me", method: "get" });

  const data = result?.data as { actingTeacherName?: unknown } | undefined;
  const principal =
    typeof data?.actingTeacherName === "string" ? data.actingTeacherName.trim() : "";

  if (!principal) return null;

  return <DelegationStrip label={t("actingOnBehalfOf")} principal={principal} />;
}
