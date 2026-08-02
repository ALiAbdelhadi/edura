"use client";

/* تسويات القاعات / Room settlements — the three-way split, as a record.
   ══════════════════════════════════════════════════════════════════════════════

   WHAT THE SYSTEM GUARANTEES: each row was written by the money engine in the SAME
   transaction as the ledger entry, exactly once per session. Nothing on this screen
   can be edited, and no action exists — so there is no ceremony here, only lineage.

   WHAT THAT MEANS FOR THE FORM: the three shares are printed side by side against the
   price they were split from, so the operator can verify the split rather than trust
   it. The attendance-mismatch flag is the one place red is earned: it means attendance
   was edited AFTER the money settled, so the row's `presentCount` and today's live
   count disagree and the difference can only be corrected by a NEW entry. */

import { useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Download, Info, RefreshCcw, Scale } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { formatEGP, formatPercent, type Locale } from "@repo/ui/lib/format";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";

type SettlementRow = {
  id: string;
  sessionId: string;
  pricingMethod: "whole_room_percent" | "per_attending_student";
  presentCount: number;
  livePresentCount: number;
  attendanceMismatch: boolean;
  perSessionPrice: number;
  platformTotal: number;
  centerTotal: number;
  teacherTotal: number;
  m2CenterFee: number | null;
  m2CenterBp: number | null;
  centerName: string | null;
  teacherName: string | null;
  courseTitle: string | null;
  roomName: string | null;
  createdAt: string;
};

export function RoomSettlementsScreen() {
  const t = useTranslations("roomSettlements");
  const locale = useLocale() as Locale;
  const [method, setMethod] = useState<string>("all");
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => ({
      page: String(page),
      limit: "50",
      ...(method !== "all" ? { pricingMethod: method } : {}),
    }),
    [method, page],
  );

  const req = useCustom({ url: "admin/session-settlements", method: "get", config: { query } });
  const data = req.result?.data as
    | { settlements: SettlementRow[]; meta: { total: number; page: number; limit: number } }
    | undefined;

  const rows = data?.settlements ?? [];
  const total = data?.meta?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.meta?.limit ?? 50)));

  // The rate is a figure, so it stays mono and Latin-digit in both locales.
  const rateOf = (r: SettlementRow) => {
    if (r.pricingMethod !== "per_attending_student") return "—";
    return r.m2CenterFee != null
      ? `${formatEGP(r.m2CenterFee, locale)} / ${t("perStudent")}`
      : `${formatPercent((r.m2CenterBp ?? 0) / 100, locale)} / ${t("perStudent")}`;
  };

  const COLS = [
    "colDate",
    "colCenter",
    "colCourse",
    "colTeacher",
    "colMethod",
    "colRate",
    "colPresent",
    "colPrice",
    "colCenterShare",
    "colTeacherShare",
    "colPlatform",
  ] as const;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")} rule />

      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
        {t("mismatchNote")}
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <select
          value={method}
          aria-label={t("colMethod")}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
          }}
          className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink-2"
        >
          <option value="all">{t("allMethods")}</option>
          <option value="whole_room_percent">{t("methodWholeRoom")}</option>
          <option value="per_attending_student">{t("methodPerStudent")}</option>
        </select>
        <span className="flex items-baseline gap-1.5 text-[13px] text-ink-2">
          <Num.Figure value={total} locale={locale} />
          {t("settlementCount")}
        </span>

        {/* A plain link, not a fetch-and-blob: the response is already an
            attachment with its filename, and a link cannot leave a stalled
            spinner behind if the download is slow. The filters travel with it
            so the file always matches what is on screen. */}
        <a
          href={`/api/v1/admin/session-settlements/export?locale=${locale}${
            method !== "all" ? `&pricingMethod=${method}` : ""
          }`}
          className="focus-ledger ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule bg-field px-3 text-[13px] text-ink-2 hover:text-ink"
        >
          <Download className="size-3.5" aria-hidden="true" />
          {t("exportXlsx")}
        </a>
      </div>

      {req.query.isLoading ? (
        <PageSpinner label={t("loading")} />
      ) : req.query.isError ? (
        (() => {
          const denied = (req.query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={AlertTriangle}
              title={t(denied ? "deniedTitle" : "loadError")}
              description={t(denied ? "deniedBody" : "loadErrorBody")}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => req.query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {t("retry")}
                  </Button>
                )
              }
            />
          );
        })()
      ) : rows.length === 0 ? (
        <EmptyState tone="empty" icon={Scale} title={t("empty")} description={t("emptyBody")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                {COLS.map((c) => (
                  <TableHead
                    key={c}
                    className={
                      // Numeric columns are END-aligned, in both directions (D-013).
                      ["colPresent", "colPrice", "colCenterShare", "colTeacherShare", "colPlatform"].includes(c)
                        ? "h-[34px] px-3 text-end"
                        : "h-[34px] px-3"
                    }
                  >
                    <Eyebrow locale={locale} marker={false}>
                      {t(c)}
                    </Eyebrow>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="border-rule-2">
                  <TableCell className="px-3 py-[7px] whitespace-nowrap">
                    <Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" />
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{r.centerName ?? "—"}</TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <div className="max-w-48 truncate text-[13px] text-ink">{r.courseTitle ?? "—"}</div>
                    {r.roomName ? <div className="text-[11px] text-ink-3">{r.roomName}</div> : null}
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{r.teacherName ?? "—"}</TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <StatusBadge tone="neutral">
                      {r.pricingMethod === "per_attending_student"
                        ? t("methodPerStudent")
                        : t("methodWholeRoom")}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="px-3 py-[7px] whitespace-nowrap">
                    <Num className="text-[11px] text-ink-2">{rateOf(r)}</Num>
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-end">
                    <span className="inline-flex items-center gap-1.5">
                      <Num.Figure value={r.presentCount} locale={locale} />
                      {/* Red is earned here: the money settled on a count that no
                          longer matches, and only a new entry can correct it. */}
                      {r.attendanceMismatch ? (
                        <StatusBadge tone="rejected" icon={AlertTriangle}>
                          <span className="inline-flex items-baseline gap-1">
                            {t("nowPresent")}
                            <Num.Figure value={r.livePresentCount} locale={locale} />
                          </span>
                        </StatusBadge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money piasters={r.perSessionPrice} locale={locale} tone="muted" sign={false} />
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money piasters={r.centerTotal} locale={locale} tone="muted" sign={false} />
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money piasters={r.teacherTotal} locale={locale} tone="muted" sign={false} />
                  </TableCell>
                  {/* The platform's own take is the decisive figure on this screen. */}
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money piasters={r.platformTotal} locale={locale} tone="net" sign={false} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-rule bg-field px-[18px] py-3">
              <Num className="text-[11px] text-ink-3">
                {page} / {pages}
              </Num>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t("prev")}
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  {t("next")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
