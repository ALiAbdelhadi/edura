"use client";

import { useState } from "react";
import { useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Handshake } from "lucide-react";

import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { PageSpinner } from "@/components/kit/spinner";
import { useListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

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
  const [detailId, setDetailId] = useState<string | null>(null);

  const resource = "admin/collaboration-requests";
  const list = useListScreen<CollabRow>({ resource });

  const { result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const d = ((detail as any)?.data ?? detail) as any;

  const initiatorLabel = (v: string) =>
    v === "teacher" ? t("collabRequests.initiatorTeacher") : t("collabRequests.initiatorCenter");

  const columns: ColumnDef<CollabRow, unknown>[] = [
    {
      id: "teacher",
      header: t("collabRequests.teacher"),
      cell: ({ row }) => (
        <span className="font-medium text-ink">{row.original.teacherName ?? "—"}</span>
      ),
    },
    {
      id: "center",
      header: t("collabRequests.center"),
      cell: ({ row }) => row.original.centerName ?? "—",
    },
    {
      id: "subject",
      header: t("collabRequests.subject"),
      cell: ({ row }) => row.original.subjectName ?? "—",
    },
    {
      id: "schedule",
      header: t("collabRequests.schedule"),
      cell: ({ row }) => (
        <Num.ClockRange
          start={row.original.startTime}
          end={row.original.endTime}
          locale={locale}
          className="text-[11px] text-ink-2"
        />
      ),
    },
    {
      id: "share",
      meta: { align: "end" },
      header: t("collabRequests.share"),
      cell: ({ row }) => (
        <Num.Money
          piasters={row.original.proposedCenterShare}
          locale={locale}
          tone="net"
          sign={false}
        />
      ),
    },
    {
      id: "initiator",
      header: t("collabRequests.initiator"),
      cell: ({ row }) => initiatorLabel(row.original.initiator),
    },
    {
      id: "status",
      header: t("collabRequests.status"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>
          {t(asKey(`status.${row.original.status}`))}
        </StatusBadge>
      ),
    },
    {
      id: "created",
      header: t("collabRequests.created"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.createdAt}
          locale={locale}
          className="text-[11px] text-ink-3"
        />
      ),
    },
  ];

  return (
    <ListShell
      list={list}
      title={t("collabRequests.title")}
      description={t("collabRequests.subtitle")}
      columns={columns}
      onRowClick={(row) => setDetailId(row.id)}
      rowLabel={(row) => row.teacherName ?? row.centerName ?? row.id}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("collabRequests.searchPlaceholder")}
            clearLabel={t("collabRequests.clearSearch")}
          />
          <ListFilter
            list={list}
            name="status"
            anyLabel={t("collabRequests.anyStatus")}
            options={["pending", "accepted", "rejected", "cancelled", "expired"]}
            render={(o) => t(asKey(`status.${o}`))}
          />
          <ListFilter
            list={list}
            name="initiator"
            anyLabel={t("collabRequests.anyInitiator")}
            options={["teacher", "center"]}
            render={initiatorLabel}
          />
        </>
      }
      loadingLabel={t("collabRequests.loading")}
      emptyIcon={Handshake}
      emptyTitle={t("collabRequests.notFound")}
      emptyDescription={t("collabRequests.emptyBody")}
      errorTitle={t("collabRequests.loadError")}
      errorDescription={t("collabRequests.loadErrorBody")}
      deniedTitle={t("collabRequests.deniedTitle")}
      deniedDescription={t("collabRequests.deniedBody")}
    >
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
                  tone={statusTone(d.status)}
                  reason={d.responseNote ?? undefined}
                >
                  {t(asKey(`status.${d.status}`))}
                </StatusBadge>
              </Row>
              <Row label={t("collabRequests.createdCourse")}>
                {d.course ? (
                  <span className="inline-flex items-baseline gap-1.5">
                    {d.course.title}
                    <StatusBadge tone={statusTone(d.course.status)}>
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
                    <StatusBadge tone={statusTone(d.affiliation.status)}>
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
    </ListShell>
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
