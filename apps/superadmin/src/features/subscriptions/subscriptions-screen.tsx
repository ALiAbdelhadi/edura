"use client";

import { useState } from "react";
import { useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { BookMarked } from "lucide-react";

import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
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

type SubRow = {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  teacherName: string | null;
  courseTitle: string | null;
  centerName: string | null;
  targetType: string;
  plan: string;
  price: number;
  status: string;
  source: string;
  paymentMethod: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

export function SubscriptionsScreen({ apiBase }: { apiBase: "admin" | "finance" }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [detailId, setDetailId] = useState<string | null>(null);

  const resource = `${apiBase}/subscriptions`;
  const list = useListScreen<SubRow>({ resource });

  const { result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const d = ((detail as any)?.data ?? detail) as any;

  const columns: ColumnDef<SubRow, unknown>[] = [
    {
      id: "student",
      header: t("subscriptions.student"),
      cell: ({ row }) => (
        <IdentityCell
          initials={initialsOf(row.original.studentName ?? "—")}
          name={row.original.studentName ?? "—"}
          meta={
            row.original.studentEmail ? <Num.Code>{row.original.studentEmail}</Num.Code> : undefined
          }
        />
      ),
    },
    {
      id: "course",
      header: t("subscriptions.course"),
      cell: ({ row }) => row.original.courseTitle ?? "—",
    },
    {
      id: "target",
      header: t("subscriptions.target"),
      cell: ({ row }) => (
        <>
          <div className="text-[13px] text-ink">
            {row.original.targetType === "center"
              ? (row.original.centerName ?? "—")
              : (row.original.teacherName ?? "—")}
          </div>
          <div className="text-[11px] text-ink-3">
            {t(asKey(`targets.${row.original.targetType}`))}
          </div>
        </>
      ),
    },
    {
      id: "plan",
      header: t("subscriptions.plan"),
      cell: ({ row }) => t(asKey(`plans.${row.original.plan}`)),
    },
    {
      id: "price",
      meta: { align: "end" },
      header: t("subscriptions.price"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.price} locale={locale} tone="net" sign={false} />
      ),
    },
    {
      id: "source",
      header: t("subscriptions.source"),
      cell: ({ row }) => t(asKey(`sources.${row.original.source}`)),
    },
    {
      id: "status",
      header: t("subscriptions.status"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>
          {t(asKey(`status.${row.original.status}`))}
        </StatusBadge>
      ),
    },
    {
      id: "created",
      header: t("subscriptions.created"),
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
      title={t("subscriptions.title")}
      description={t("subscriptions.subtitle")}
      columns={columns}
      onRowClick={(row) => setDetailId(row.id)}
      rowLabel={(row) => row.studentName ?? row.id}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("subscriptions.searchPlaceholder")}
            clearLabel={t("subscriptions.clearSearch")}
          />
          <ListFilter
            list={list}
            name="status"
            anyLabel={t("subscriptions.anyStatus")}
            options={["pending_payment", "active", "expired", "cancelled"]}
            render={(o) => t(asKey(`status.${o}`))}
          />
          <ListFilter
            list={list}
            name="plan"
            anyLabel={t("subscriptions.anyPlan")}
            options={["monthly", "per_session"]}
            render={(o) => t(asKey(`plans.${o}`))}
          />
          <ListFilter
            list={list}
            name="source"
            anyLabel={t("subscriptions.anySource")}
            options={["online", "walk_in"]}
            render={(o) => t(asKey(`sources.${o}`))}
          />
          <ListFilter
            list={list}
            name="targetType"
            anyLabel={t("subscriptions.anyTarget")}
            options={["center", "teacher"]}
            render={(o) => t(asKey(`targets.${o}`))}
          />
        </>
      }
      loadingLabel={t("subscriptions.loading")}
      emptyIcon={BookMarked}
      emptyTitle={t("subscriptions.notFound")}
      emptyDescription={t("subscriptions.emptyBody")}
      errorTitle={t("subscriptions.loadError")}
      errorDescription={t("subscriptions.loadErrorBody")}
      deniedTitle={t("subscriptions.deniedTitle")}
      deniedDescription={t("subscriptions.deniedBody")}
    >
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("subscriptions.detailTitle")}</DialogTitle>
          </DialogHeader>
          {d ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Row label={t("subscriptions.subId")}>
                <Num.Code>{d.id}</Num.Code>
              </Row>
              <Row label={t("subscriptions.student")}>
                {d.student?.name} {d.student?.email ? <Num.Code>{d.student.email}</Num.Code> : null}
              </Row>
              <Row label={t("subscriptions.targetVal")}>
                {d.targetType === "center" ? d.center?.name : d.teacher?.name}{" "}
                <span className="text-ink-3">({t(asKey(`targets.${d.targetType}`))})</span>
              </Row>
              <Row label={t("subscriptions.course")}>
                {d.course?.title ?? "—"}
                {d.course?.location ? <span className="text-ink-3"> — {d.course.location}</span> : null}
              </Row>
              <Row label={t("subscriptions.planPrice")}>
                {t(asKey(`plans.${d.plan}`))}{" "}
                <Num.Money piasters={d.price} locale={locale} tone="net" sign={false} />
              </Row>
              <Row label={t("subscriptions.status")}>
                <StatusBadge tone={statusTone(d.status)}>
                  {t(asKey(`status.${d.status}`))}
                </StatusBadge>
              </Row>
              <Row label={t("subscriptions.sourceMethod")}>
                {t(asKey(`sources.${d.source}`))}
                {d.paymentMethod ? ` / ${t(asKey(`methods.${d.paymentMethod}`))}` : " / —"}
              </Row>
              <Row label={t("subscriptions.coverage")}>
                {d.plan === "monthly" ? (
                  d.periodStart ? (
                    <>
                      <Num.Date value={d.periodStart} locale={locale} />
                      <span aria-hidden="true" className="mx-1 text-ink-3">
                        →
                      </span>
                      <Num.Date value={d.periodEnd} locale={locale} />
                    </>
                  ) : (
                    "—"
                  )
                ) : d.sessionId ? (
                  <Num.Code>{d.sessionId}</Num.Code>
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("subscriptions.receipt")}>
                {d.payment?.receiptNumber ? <Num.Code>{d.payment.receiptNumber}</Num.Code> : "—"}
              </Row>
              <Row label={t("subscriptions.paymentIntent")}>
                {d.intent ? (
                  <span className="inline-flex items-baseline gap-1.5">
                    <Num.Code>{d.intent.id.slice(0, 8)}</Num.Code>
                    <StatusBadge tone={statusTone(d.intent.status)}>
                      {t(asKey(`status.${d.intent.status}`))}
                    </StatusBadge>
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("subscriptions.enrollment")}>
                {d.enrollment ? t(asKey(`status.${d.enrollment.status}`)) : "—"}
              </Row>
              <Row label={t("subscriptions.createdActivated")}>
                <Num.Date value={d.createdAt} locale={locale} />
                {d.activatedAt ? (
                  <>
                    <span aria-hidden="true" className="mx-1 text-ink-3">
                      →
                    </span>
                    <Num.Date value={d.activatedAt} locale={locale} />
                  </>
                ) : null}
              </Row>
            </dl>
          ) : (
            <PageSpinner label={t("common.loading")} />
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
