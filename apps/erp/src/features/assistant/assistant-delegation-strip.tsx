"use client";

import { useGetIdentity } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { DelegationStrip } from "@repo/ui/components/delegation-strip";

export function AssistantDelegationStrip() {
  const t = useTranslations("delegation");
  const { data } = useGetIdentity<{ actingTeacherName?: unknown } | null>({
    queryOptions: { refetchOnMount: false },
  });

  const principal =
    typeof data?.actingTeacherName === "string" ? data.actingTeacherName.trim() : "";

  if (!principal) return null;

  return <DelegationStrip label={t("actingOnBehalfOf")} principal={principal} />;
}
