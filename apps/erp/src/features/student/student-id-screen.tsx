"use client";

import { useRef, useState } from "react";
import { useCustom } from "@refinedev/core";
import { useOnDemand } from "@/lib/api/use-on-demand";
import { useTranslations, useLocale } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, IdCard, Printer, Share2, CircleAlert } from "lucide-react";
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

export function StudentIdScreen({
  studentId,
  showChecklist = true,
  audience = "student",
}: {
  studentId?: string;
  /**
   * Off for the parent view. Every fix link on the list is a student route
   * ("/onboarding", the student's own settings) — offering them to a parent
   * would be offering an action that is not theirs to take.
   */
  showChecklist?: boolean;
  /**
   * WHO IS READING. The screen is shared — a parent opens their child's card
   * through the same component, on purpose, so there is one authorization path
   * — but the copy was not: a parent was shown "بطاقتك الشخصية … بتسجّل
   * حضورك", second person, about someone else's card. The heading and the
   * refusal below are the only two things that differ.
   */
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

  // ---- The page opens with the LIGHT read. It builds no card and signs no QR;
  // it answers one question — is there a card to offer, or is something still
  // missing? Everything else waits for the reader to ask.
  const { query: q, result } = useCustom<ProfileChecklist>({
    url: `me/profile-checklist${query}`,
    method: "get",
    queryOptions: {
      // A 403 here is an ANSWER — "not an approved child of this parent" — and
      // under React Query's defaults it was being treated as a transport
      // failure: retried, then PAUSED (`status:"pending", fetchStatus:"paused"`,
      // no error ever set) while `isLoading` read false. So the screen could
      // not learn why it had nothing, which is how it came to render a blank
      // rectangle. Measured on this exact route, not assumed.
      networkMode: "always",
      // Nothing about a refusal changes by asking again.
      retry: (count, error) => {
        const status = (error as { statusCode?: number } | null)?.statusCode ?? 0;
        if (status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  });

  // ---- The card. Not requested until the button is pressed, and not askable
  // at all until the record is complete — `enabled` mirrors the server's own
  // refusal so the screen never asks for something it knows will be refused.
  const checklist = (result?.data ?? null) as ProfileChecklist | null;
  const cardReq = useOnDemand<{ card: StudentCard }>(`me/student-card${query}`, {
    enabled: checklist?.cardAvailable === true,
  });
  const card = cardReq.data?.card ?? null;

  if (q.isPending && !q.isError) return <PageSpinner />;

  // `return null` used to stand here, so a parent opening the card of a child
  // whose link is not approved got a correctly-refused request (403 "Not an
  // approved child of this parent") and a BLANK RECTANGLE. The gate was doing
  // its job; the screen simply had nowhere to put the answer, and a refusal
  // that looks identical to a crash teaches people the app is broken.
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
      <PageTitle eyebrow={t("eyebrow")} title={title} subtitle={subtitle} />

      {!checklist.cardAvailable ? (
        // NOT READY — and the screen says which of the two reasons it is.
        // A card is a document that leaves the product; minting one from a
        // half-filled record produces an object that outlives the gaps in it,
        // and the student cannot recall the copies once the record is fixed.
        //
        // What this does NOT do is lock them out: their code still works, so
        // the counter can still find them by phone or by name and still check
        // them in. The list below is the whole of what is missing, and every
        // row links to the one screen that fixes it.
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
      ) : !cardReq.requested ? (
        // ---- THE CARD IS NOT BUILT UNTIL IT IS ASKED FOR.
        // Opening this screen costs one light query; the card — which signs a
        // QR and, for a super admin elsewhere, writes an audit row — is
        // produced only by this press. It is a button and not an auto-load
        // because a card is a thing you go and get, not a thing that happens
        // to you on the way past.
        <Sheet className="flex flex-col items-start gap-3 p-5">
          <div className="space-y-1">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("showHint")}
            </p>
          </div>
          <Button onClick={cardReq.request} size="sm">
            <IdCard className="size-4" />
            {t("showCard")}
          </Button>
        </Sheet>
      ) : cardReq.loading ? (
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

          {/* Off-screen QR at export resolution, and INSIDE the branch that has
              a card — rendering it above would have kept a second QR encoder
              mounted on a screen showing no card at all. */}
          <div ref={qrRef} className="pointer-events-none absolute -z-10 opacity-0" aria-hidden>
            {/* The SAME payload the on-screen card encodes — read off the one
                `card.qr.url` the server signed, never rebuilt here. A PNG whose
                square resolved to something different from the printed card is
                a card that works on paper and fails on WhatsApp. */}
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
