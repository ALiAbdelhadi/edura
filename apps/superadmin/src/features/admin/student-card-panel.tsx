"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, IdCard, RefreshCcw, ShieldOff } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { StudentIdCard } from "@repo/ui/components/student-id-card";
import { toast } from "@repo/ui/components/sonner";

import { Spinner } from "@/components/kit/spinner";
import { ReasonDialog, type ReasonAction } from "./user-detail-screen";

type CardPayload = {
  studentId: string;
  name: string;
  studentCode: string;
  isPending: boolean;
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  patternSeed: string;
  qr: {
    url: string;
    version: number;
    issuedAt: string | null;
    revokedAt: string | null;
    revokedReason: string | null;
  };
};

export function StudentCardPanel({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers.card");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ReasonAction | null>(null);
  const { mutateAsync: mutate } = useCustomMutation();

  const req = useCustom({
    url: `admin/users/${userId}/card`,
    method: "get",
    queryOptions: { enabled: open },
  });

  const card = (req.result?.data ?? null) as CardPayload | null;

  const run = async (which: ReasonAction, reason: string) => {
    try {
      await mutate({
        url: `admin/users/${userId}/card`,
        method: "post",
        values: { action: which === "reissueCard" ? "reissue" : "revoke", reason },
      });
      toast.success(t(which === "reissueCard" ? "reissuedToast" : "revokedToast"));
      await req.query.refetch();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("failed"));
    }
  };

  return (
    <section className="rounded-xl border border-rule bg-sheet p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-start"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <IdCard className="size-4 text-ink-3" aria-hidden="true" />
          <span className="text-[15px] font-bold text-ink">{t("title")}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <p className="mt-1 text-[12.5px] text-ink-3">{t("subtitle")}</p>

      {!open ? null : req.query.isPending ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : !card ? (
        <p className="py-4 text-sm text-ink-2">{t("unavailable")}</p>
      ) : card.isPending ? (
        <p className="py-4 text-sm text-ink-2">{t("pendingCode")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="mx-auto max-w-[420px]">
            <StudentIdCard
              card={card}
              locale={locale}
              labels={{ cardTitle: t("cardTitle"), codeLabel: t("codeLabel") }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
            <span>{t("issue")}</span>
            <Num>{card.qr.version}</Num>
            {card.qr.revokedAt ? (
              <StatusBadge tone="rejected">{t("revoked")}</StatusBadge>
            ) : (
              <StatusBadge tone="paid">{t("active")}</StatusBadge>
            )}
          </div>

          {card.qr.revokedReason ? (
            <p className="rounded-[10px] bg-red-soft p-3 text-sm text-ink">
              <span className="text-ink-3">{t("revokedReason")} </span>
              {card.qr.revokedReason}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAction("reissueCard")}>
              <RefreshCcw className="size-4" aria-hidden="true" />
              {t("reissue")}
            </Button>
            {card.qr.revokedAt ? null : (
              <Button variant="outline" size="sm" onClick={() => setAction("revokeCard")}>
                <ShieldOff className="size-4" aria-hidden="true" />
                {t("revoke")}
              </Button>
            )}
          </div>

          <p className="text-[12px] leading-relaxed text-ink-3">{t("reissueHint")}</p>
        </div>
      )}

      <ReasonDialog action={action} onClose={() => setAction(null)} onConfirm={run} />
    </section>
  );
}
