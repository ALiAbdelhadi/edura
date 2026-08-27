"use client";

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Handshake, RefreshCcw, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import { SearchInput } from "@repo/ui/components/search-input";
import { StatusBadge, type StatusTone } from "@repo/ui/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import type { Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";

const ANY = "__any__";

const STATUS_TONE: Record<string, StatusTone> = {
  accepted: "paid",
  rejected: "rejected",
  cancelled: "rejected",
  pending: "pending",
  expired: "neutral",
};

type CollabRow = {
  id: string;
  initiator: string;
  teacherName: string | null;
  centerName: string | null;
  subjectName: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  proposedCenterShare: number;
  expectedStudents: number | null;
  status: string;
  createdAt: string;
};

export function CollaborationRequestsScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [initiator, setInitiator] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const resource = "admin/collaboration-requests";
  const { query, result } = useList({
    resource,
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
      ...(initiator ? [{ field: "initiator", operator: "eq" as const, value: initiator }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as CollabRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const { result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const d = ((detail as any)?.data ?? detail) as any;

  const initiatorLabel = (v: string) =>
    v === "teacher" ? t("collabRequests.initiatorTeacher") : t("collabRequests.initiatorCenter");

  const filter = (
    anyLabel: string,
    value: string | null,
    set: (v: string | null) => void,
    options: string[],
    render: (o: string) => string,
  ) => (
    <select
      value={value ?? ANY}
      aria-label={anyLabel}
      onChange={(e) => {
        set(e.target.value === ANY ? null : e.target.value);
        setPage(1);
      }}
      className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink-2"
    >
      <option value={ANY}>{anyLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {render(o)}
        </option>
      ))}
    </select>
  );

  const COLS = [
    "teacher",
    "center",
    "subject",
    "schedule",
    "share",
    "initiator",
    "status",
    "created",
  ] as const;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("collabRequests.title")}
        description={t("collabRequests.subtitle")}
        rule
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <SearchInput
          className="min-w-64 flex-1"
          placeholder={t("collabRequests.searchPlaceholder")}
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          onClear={() => setQ("")}
          clearLabel={t("collabRequests.clearSearch")}
        />
        {filter(
          t("collabRequests.anyStatus"),
          status,
          setStatus,
          ["pending", "accepted", "rejected", "cancelled", "expired"],
          (o) => t(asKey(`status.${o}`)),
        )}
        {filter(t("collabRequests.anyInitiator"), initiator, setInitiator, ["teacher", "center"], initiatorLabel)}
      </div>

      {query.isLoading ? (
        <PageSpinner label={t("collabRequests.loading")} />
      ) : query.isError ? (
        (() => {
          const denied = (query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={t(denied ? "collabRequests.deniedTitle" : "collabRequests.loadError")}
              description={t(denied ? "collabRequests.deniedBody" : "collabRequests.loadErrorBody")}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {t("collabRequests.retry")}
                  </Button>
                )
              }
            />
          );
        })()
      ) : rows.length === 0 ? (
        <EmptyState
          tone="empty"
          icon={Handshake}
          title={t("collabRequests.notFound")}
          description={t("collabRequests.emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                {COLS.map((c) => (
                  <TableHead key={c} className={c === "share" ? "h-[34px] px-3 text-end" : "h-[34px] px-3"}>
                    <Eyebrow locale={locale} marker={false}>
                      {t(asKey(`collabRequests.${c}`))}
                    </Eyebrow>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer border-rule-2"
                  onClick={() => setDetailId(r.id)}
                >
                  <TableCell className="px-3 py-[7px] text-[13px] font-medium text-ink">
                    {r.teacherName ?? "—"}
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{r.centerName ?? "—"}</TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{r.subjectName ?? "—"}</TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.ClockRange
                      start={r.startTime}
                      end={r.endTime}
                      locale={locale}
                      className="text-[11px] text-ink-2"
                    />
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money
                      piasters={r.proposedCenterShare}
                      locale={locale}
                      tone="net"
                      sign={false}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">
                    {initiatorLabel(r.initiator)}
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {t(asKey(`status.${r.status}`))}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-rule bg-field px-[18px] py-3">
              <Num className="text-[11px] text-ink-3">
                {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} / {total}
              </Num>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t("actions.previous")}
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  {t("actions.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("collabRequests.detailTitle")}</DialogTitle>
          </DialogHeader>
          {d ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Row label={t("collabRequests.teacher")}>
                {d.teacher?.name} {d.teacher?.email ? <Num.Code>{d.teacher.email}</Num.Code> : null}
              </Row>
              <Row label={t("collabRequests.center")}>{d.center?.name ?? "—"}</Row>
              <Row label={t("collabRequests.subject")}>
                {d.subject?.nameEn ?? d.subject?.nameAr} — {d.grade?.nameEn ?? d.grade?.nameAr}
              </Row>
              <Row label={t("collabRequests.schedule")}>
                <Num.ClockRange start={d.startTime} end={d.endTime} locale={locale} />
                <span aria-hidden="true" className="mx-1 text-ink-3">
                  ·
                </span>
                <Num.Date value={d.startDate} locale={locale} />
              </Row>
              <Row label={t("collabRequests.share")}>
                <Num.Money piasters={d.proposedCenterShare} locale={locale} tone="net" sign={false} />
              </Row>
              <Row label={t("collabRequests.expected")}>
                {d.expectedStudents != null ? (
                  <Num.Figure value={d.expectedStudents} locale={locale} />
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("collabRequests.initiator")}>{initiatorLabel(d.initiator)}</Row>
              <Row label={t("collabRequests.status")}>
                <StatusBadge
                  tone={STATUS_TONE[d.status] ?? "neutral"}
                  reason={d.responseNote ?? undefined}
                >
                  {t(asKey(`status.${d.status}`))}
                </StatusBadge>
              </Row>
              <Row label={t("collabRequests.createdCourse")}>
                {d.course ? (
                  <span className="inline-flex items-baseline gap-1.5">
                    {d.course.title}
                    <StatusBadge tone={STATUS_TONE[d.course.status] ?? "neutral"}>
                      {t(asKey(`status.${d.course.status}`))}
                    </StatusBadge>
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("collabRequests.affiliation")}>
                {d.affiliation ? (
                  <span className="inline-flex items-baseline gap-1.5">
                    <StatusBadge tone={STATUS_TONE[d.affiliation.status] ?? "neutral"}>
                      {t(asKey(`status.${d.affiliation.status}`))}
                    </StatusBadge>
                    <Num.Money
                      piasters={d.affiliation.centerShare ?? 0}
                      locale={locale}
                      tone="muted"
                      sign={false}
                    />
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("collabRequests.message")}>{d.message ?? "—"}</Row>
            </dl>
          ) : (
            <PageSpinner label={t("collabRequests.loading")} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
