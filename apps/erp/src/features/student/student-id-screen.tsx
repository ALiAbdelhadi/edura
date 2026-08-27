"use client";

import { useEffect, useRef, useState } from "react";
import { useCustom } from "@refinedev/core";
import { useOnDemand } from "@/lib/api/use-on-demand";
import { useTranslations, useLocale } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, Printer, Share2, CircleAlert } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { Link } from "@/i18n/navigation";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { formatStudentCode } from "@repo/database/student-code";
import type {
  ProfileChecklist,
  StudentCard,
} from "@repo/server-core/services/students/student-card";
import { Hairline, PageTitle, Sheet, Eyebrow } from "@/features/student/ledger";
import { StudentIdCard } from "./student-id-card";
import { renderStudentCardPng } from "./student-id-card-png";
import { GuardianContactNotice } from "./guardian-contact-notice";

export function StudentIdScreen({
  studentId,
  showChecklist = true,
  audience = "student",
}: {
  studentId?: string;
  showChecklist?: boolean;
  audience?: "student" | "parent";
}) {
  const t = useTranslations("studentIdCard");
  const locale = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const labels = { cardTitle: t("cardTitle"), codeLabel: t("codeLabel") };
  const title = audience === "parent" ? t("parentTitle") : t("title");
  const subtitle = audience === "parent" ? t("parentSubtitle") : t("subtitle");
  const query = studentId ? `?studentId=${studentId}` : "";

  const { query: q, result } = useCustom<ProfileChecklist>({
    url: `me/profile-checklist${query}`,
    method: "get",
    queryOptions: {
      networkMode: "always",
      retry: (count, error) => {
        const status = (error as { statusCode?: number } | null)?.statusCode ?? 0;
        if (status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  });

  const checklist = (result?.data ?? null) as ProfileChecklist | null;
  const cardReq = useOnDemand<{ card: StudentCard }>(`me/student-card${query}`, {
    enabled: checklist?.cardAvailable === true,
  });
  const card = cardReq.data?.card ?? null;

  const { request: requestCard } = cardReq;
  const canAsk = checklist?.cardAvailable === true;
  useEffect(() => {
    if (canAsk) requestCard();
  }, [canAsk, requestCard]);

  if (q.isPending && !q.isError) return <PageSpinner />;

  if (!checklist) {
    const forbidden = (q.error as { statusCode?: number } | null)?.statusCode === 403;
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <PageTitle eyebrow={t("eyebrow")} title={title} subtitle={subtitle} />
        <Sheet blocking className="flex items-start gap-3 p-4">
          <CircleAlert className="mt-[2px] size-4 shrink-0" style={{ color: "var(--red)" }} />
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {forbidden ? t("notYours") : t("unavailable")}
          </p>
        </Sheet>
      </div>
    );
  }

  const copy = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.studentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const png = async () => {
    const el = cardRef.current;
    if (!el || !card) return;
    setBusy(true);
    try {
      const blob = await renderStudentCardPng({
        card,
        locale,
        sourceEl: el,
        qrCanvas: qrRef.current?.querySelector("canvas") ?? null,
        labels,
      });
      const file = new File([blob], `${card.studentCode}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t("cardTitle") });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast.error(t("imageFailed"));
    } finally {
      setBusy(false);
    }
  };

  const missing = checklist.items.filter((i) => !i.done);
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.canShare);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <PageTitle eyebrow={t("eyebrow")} title={title} subtitle={subtitle} />

      {!checklist.cardAvailable ? (
        <Sheet blocking className="flex items-start gap-3 p-4">
          <CircleAlert className="mt-[2px] size-4 shrink-0" style={{ color: "var(--red)" }} />
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--ink)" }}>
              {t("incompleteBody")}
            </p>
            <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
              {t("incompleteHint")}
            </p>
            {missing.some((i) => i.key === "academic") ? (
              <Button asChild size="sm">
                <Link href="/onboarding">{t("pendingAction")}</Link>
              </Button>
            ) : null}
          </div>
        </Sheet>
      ) : cardReq.loading || !cardReq.requested ? (
        <Sheet className="flex items-center justify-center p-8">
          <Spinner />
        </Sheet>
      ) : !card ? (
        <Sheet blocking className="flex items-start gap-3 p-4">
          <CircleAlert className="mt-[2px] size-4 shrink-0" style={{ color: "var(--red)" }} />
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {cardReq.error?.statusCode === 403 ? t("notYours") : t("unavailable")}
          </p>
        </Sheet>
      ) : (
        <>
          <div ref={cardRef}>
            <StudentIdCard card={card} locale={locale} labels={labels} />
          </div>

          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {t("counterHint", { code: formatStudentCode(card.studentCode) })}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={copy} variant="outline" size="sm">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t("copied") : t("copyCode")}
            </Button>
            <Button onClick={png} size="sm" disabled={busy}>
              {busy ? <Spinner /> : canShare ? <Share2 className="size-4" /> : <Download className="size-4" />}
              {canShare ? t("shareImage") : t("saveImage")}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/${locale}/student-id/print${query}`} target="_blank" rel="noreferrer">
                <Printer className="size-4" />
                {t("print")}
              </a>
            </Button>
          </div>

          <div ref={qrRef} className="pointer-events-none absolute -z-10 opacity-0" aria-hidden>
            <QRCodeCanvas value={card.qr.url} size={184} level="M" bgColor="#ffffff" fgColor="#000000" />
          </div>
        </>
      )}

      <GuardianContactNotice studentId={studentId} />

      {showChecklist && missing.length > 0 ? (
        <Sheet className="p-4">
          <Eyebrow>{t("completeEyebrow")}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("completeBody", { done: checklist.completed, total: checklist.total })}
          </p>
          <div className="my-4">
            <Hairline />
          </div>
          <ul className="flex flex-col gap-3">
            {missing.map((item) => (
              <li
                key={item.key}
                className="flex min-h-8 items-center justify-between gap-3"
              >
                <span
                  className="text-sm"
                  style={{ color: item.blocking ? "var(--ink)" : "var(--ink-2)" }}
                >
                  {t(`checklist.${item.key}` as "checklist.name")}
                </span>
                {item.fixHref ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={item.fixHref}>{t("fix")}</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
    </div>
  );
}
