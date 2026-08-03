"use client";

import { useRef, useState } from "react";
import { useCustom } from "@refinedev/core";
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

/* بطاقتي / My card — the screen the card lives on.
   ══════════════════════════════════════════════════════════════════════════════

   Three things, in the order a student needs them: the card, the two ways to
   take it with them, and — only when something is actually missing — what is
   still incomplete about their record.

   THE CHECKLIST IS NOT A NAG. It appears when an item is missing and disappears
   when it is not, and every row either links to the one screen that fixes it or
   is fixed inline right there (the guardian email). An item nobody can act on is
   not listed at all: `date_of_birth` is missing for nearly every student and is
   set by a super admin against evidence, so putting it here would be an action
   the interface promises and then refuses. */

type Payload = { card: StudentCard; checklist: ProfileChecklist };

export function StudentIdScreen({
  studentId,
  showChecklist = true,
}: {
  studentId?: string;
  /**
   * Off for the parent view. Every fix link on the list is a student route
   * ("/onboarding", the student's own settings) — offering them to a parent
   * would be offering an action that is not theirs to take.
   */
  showChecklist?: boolean;
}) {
  const t = useTranslations("studentIdCard");
  const locale = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const labels = { cardTitle: t("cardTitle"), codeLabel: t("codeLabel") };
  const query = studentId ? `?studentId=${studentId}` : "";
  const { query: q, result } = useCustom<Payload>({
    url: `me/student-card${query}`,
    method: "get",
  });

  // `result` is refine's placeholder `{ data: {} }` while the query is in
  // flight, so this is narrowed on the VALUE rather than trusted from the
  // generic — the same trap that had DataRightsCard throwing on first paint.
  const payload = result?.data;

  if (q.isLoading) return <PageSpinner />;
  if (!payload?.card) return null;

  const { card, checklist } = payload;

  const copy = async () => {
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
    if (!el) return;
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

      // On a phone this opens the share sheet — which on this platform means
      // WhatsApp, where the card is actually going. Everywhere else it falls
      // back to a download.
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
      // A cancelled share sheet rejects; that is not an error worth shouting.
      if ((err as Error)?.name !== "AbortError") toast.error(t("imageFailed"));
    } finally {
      setBusy(false);
    }
  };

  const missing = checklist.items.filter((i) => !i.done);
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.canShare);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <PageTitle eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      {card.isPending ? (
        // A pending code is real and works, but it is going to CHANGE the
        // moment they finish onboarding. Handing them a card to print now
        // would be handing them one that stops matching their record.
        <Sheet blocking className="flex items-start gap-3 p-4">
          <CircleAlert className="mt-[2px] size-4 shrink-0" style={{ color: "var(--red)" }} />
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--ink)" }}>
              {t("pendingBody")}
            </p>
            <Button asChild size="sm">
              <Link href="/onboarding">{t("pendingAction")}</Link>
            </Button>
          </div>
        </Sheet>
      ) : (
        <>
          <div ref={cardRef}>
            <StudentIdCard card={card} locale={locale} labels={labels} />
          </div>

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

          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {t("counterHint", { code: formatStudentCode(card.studentCode) })}
          </p>
        </>
      )}

      {/* Off-screen QR at export resolution. Rendered here rather than inside
          the card so the card stays one clean SVG and the exporter still gets
          a real canvas to copy. */}
      <div ref={qrRef} className="pointer-events-none absolute -z-10 opacity-0" aria-hidden>
        <QRCodeCanvas value={card.studentCode} size={184} level="M" bgColor="#ffffff" fgColor="#000000" />
      </div>

      <GuardianContactNotice studentId={studentId} />

      {showChecklist && missing.length > 0 ? (
        <Sheet className="p-4">
          <Eyebrow>{t("completeEyebrow")}</Eyebrow>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {t("completeBody", { done: checklist.completed, total: checklist.total })}
          </p>
          {/* The rule takes its air from a wrapper, not from a prop: <Hairline>
              is shared chrome and carries no className, so a screen that wants
              space around it says so here rather than widening a component
              five other portals render. */}
          <div className="my-4">
            <Hairline />
          </div>
          {/* `min-h-8` is the height of the `sm` Button, so a row whose item
              has no fix link keeps the same rhythm as the rows that do —
              otherwise the list reads as three unequal bands. */}
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
