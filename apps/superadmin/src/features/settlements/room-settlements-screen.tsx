"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Download, Info, Scale } from "lucide-react";

import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { formatEGP, formatPercent, type Locale } from "@repo/ui/lib/format";

import { api } from "@/lib/api/client";
import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListShell } from "@/components/kit/list-shell";
import { useCustomListScreen } from "@/lib/api/use-list-screen";

type SettlementRow = {
  id: string;
  sessionId: string;
  pricingMethod: "whole_room_percent" | "per_attending_student" | null;
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
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [exporting, setExporting] = useState(false);

  const list = useCustomListScreen<SettlementRow>({
    url: "admin/session-settlements",
    pageSize: 50,
    select: (data) => {
      const d = data as { settlements?: SettlementRow[]; meta?: { total?: number } } | undefined;
      return { rows: d?.settlements ?? [], total: d?.meta?.total ?? 0 };
    },
  });
  const method = list.filter("pricingMethod");

  // The old plain anchor landed a raw JSON error page in a tab on any failure.
  const exportXlsx = async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading(tc("exportPreparing"));
    try {
      const res = await api.get(
        `admin/session-settlements/export?locale=${locale}${
          method ? `&pricingMethod=${method}` : ""
        }`,
        { timeout: 120_000 },
      );
      const blob = await res.blob();
      const named = /filename="?([^"]+)"?/.exec(
        res.headers.get("content-disposition") ?? "",
      )?.[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named || "session-settlements.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(tc("exportReady"), { id: toastId });
    } catch (e) {
      toast.error((e as { message?: string })?.message || tc("exportFailed"), { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const rateOf = (r: SettlementRow) => {
    if (r.pricingMethod !== "per_attending_student") return "—";
    return r.m2CenterFee != null
      ? `${formatEGP(r.m2CenterFee, locale)} / ${t("perStudent")}`
      : `${formatPercent((r.m2CenterBp ?? 0) / 100, locale)} / ${t("perStudent")}`;
  };

  const columns: ColumnDef<SettlementRow, unknown>[] = [
    {
      id: "date",
      header: t("colDate"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.createdAt}
          locale={locale}
          className="text-[11px] whitespace-nowrap text-ink-3"
        />
      ),
    },
    {
      id: "center",
      header: t("colCenter"),
      cell: ({ row }) => row.original.centerName ?? "—",
    },
    {
      id: "course",
      header: t("colCourse"),
      cell: ({ row }) => (
        <>
          <div className="max-w-48 truncate text-[13px] text-ink">
            {row.original.courseTitle ?? "—"}
          </div>
          {row.original.roomName ? (
            <div className="text-[11px] text-ink-3">{row.original.roomName}</div>
          ) : null}
        </>
      ),
    },
    {
      id: "teacher",
      header: t("colTeacher"),
      cell: ({ row }) => row.original.teacherName ?? "—",
    },
    {
      id: "method",
      header: t("colMethod"),
      cell: ({ row }) => (
        <StatusBadge tone="neutral">
          {row.original.pricingMethod === "per_attending_student"
            ? t("methodPerStudent")
            : row.original.pricingMethod === "whole_room_percent"
              ? t("methodWholeRoom")
              : t("methodNoRoom")}
        </StatusBadge>
      ),
    },
    {
      id: "rate",
      header: t("colRate"),
      cell: ({ row }) => (
        <Num className="text-[11px] whitespace-nowrap text-ink-2">{rateOf(row.original)}</Num>
      ),
    },
    {
      id: "present",
      meta: { align: "end" },
      header: t("colPresent"),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          <Num.Figure value={row.original.presentCount} locale={locale} />
          {row.original.attendanceMismatch ? (
            <StatusBadge tone="rejected" icon={AlertTriangle}>
              <span className="inline-flex items-baseline gap-1">
                {t("nowPresent")}
                <Num.Figure value={row.original.livePresentCount} locale={locale} />
              </span>
            </StatusBadge>
          ) : null}
        </span>
      ),
    },
    {
      id: "price",
      meta: { align: "end" },
      header: t("colPrice"),
      cell: ({ row }) => (
        <Num.Money
          piasters={row.original.perSessionPrice}
          locale={locale}
          tone="muted"
          sign={false}
        />
      ),
    },
    {
      id: "centerShare",
      meta: { align: "end" },
      header: t("colCenterShare"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.centerTotal} locale={locale} tone="muted" sign={false} />
      ),
    },
    {
      id: "teacherShare",
      meta: { align: "end" },
      header: t("colTeacherShare"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.teacherTotal} locale={locale} tone="muted" sign={false} />
      ),
    },
    {
      id: "platform",
      meta: { align: "end" },
      header: t("colPlatform"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.platformTotal} locale={locale} tone="net" sign={false} />
      ),
    },
  ];

  return (
    <ListShell
      list={list}
      title={t("title")}
      description={t("subtitle")}
      columns={columns}
      notice={
        <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
          <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
          {t("mismatchNote")}
        </p>
      }
      toolbar={
        <>
          <ListFilter
            list={list}
            name="pricingMethod"
            anyLabel={t("allMethods")}
            options={["whole_room_percent", "per_attending_student"]}
            render={(m) => (m === "whole_room_percent" ? t("methodWholeRoom") : t("methodPerStudent"))}
          />
          <span className="flex items-baseline gap-1.5 text-[13px] text-ink-2">
            <Num.Figure value={list.total} locale={locale} />
            {t("settlementCount")}
          </span>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportXlsx()}
            className="focus-ledger ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule bg-field px-3 text-[13px] text-ink-2 hover:text-ink disabled:opacity-60"
          >
            <Download className="size-3.5" aria-hidden="true" />
            {t("exportXlsx")}
          </button>
        </>
      }
      loadingLabel={t("loading")}
      emptyIcon={Scale}
      emptyTitle={t("empty")}
      emptyDescription={t("emptyBody")}
      errorTitle={t("loadError")}
      errorDescription={t("loadErrorBody")}
      deniedTitle={t("deniedTitle")}
      deniedDescription={t("deniedBody")}
    />
  );
}
