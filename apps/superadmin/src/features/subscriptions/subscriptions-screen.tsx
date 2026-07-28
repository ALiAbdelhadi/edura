"use client";

/* الاشتراكات / Subscriptions — coverage, as a record.
   ══════════════════════════════════════════════════════════════════════════════

   A subscription WRAPS enrollment: enrollment is the roster link, the subscription is
   the payment coverage that access and attendance checks consult. So the honest form
   for this screen is lineage — each row's detail shows the receipt, the payment intent
   and the enrollment it produced, because those are the three records that prove the
   coverage is real.

   Read-only: coverage is created by a payment, never by an operator here. No action,
   no ceremony. */

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { BookMarked, RefreshCcw, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
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
  active: "paid",
  cancelled: "rejected",
  pending_payment: "pending",
  expired: "neutral",
};

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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const resource = `${apiBase}/subscriptions`;
  const { query, result } = useList({
    resource,
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
      ...(plan ? [{ field: "plan", operator: "eq" as const, value: plan }] : []),
      ...(source ? [{ field: "source", operator: "eq" as const, value: source }] : []),
      ...(targetType ? [{ field: "targetType", operator: "eq" as const, value: targetType }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as SubRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const { result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const d = ((detail as any)?.data ?? detail) as any;

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

  const COLS = ["student", "course", "target", "plan", "price", "source", "status", "created"] as const;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("subscriptions.title")}
        description={t("subscriptions.subtitle")}
        rule
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <SearchInput
          className="min-w-64 flex-1"
          placeholder={t("subscriptions.searchPlaceholder")}
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          onClear={() => setQ("")}
          clearLabel={t("subscriptions.clearSearch")}
        />
        {filter(t("subscriptions.anyStatus"), status, setStatus, ["pending_payment", "active", "expired", "cancelled"], (o) => t(asKey(`status.${o}`)))}
        {filter(t("subscriptions.anyPlan"), plan, setPlan, ["monthly", "per_session"], (o) => t(asKey(`plans.${o}`)))}
        {filter(t("subscriptions.anySource"), source, setSource, ["online", "walk_in"], (o) => t(asKey(`sources.${o}`)))}
        {filter(t("subscriptions.anyTarget"), targetType, setTargetType, ["center", "teacher"], (o) => t(asKey(`targets.${o}`)))}
      </div>

      {query.isLoading ? (
        <PageSpinner label={t("subscriptions.loading")} />
      ) : query.isError ? (
        (() => {
          const denied = (query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={t(denied ? "subscriptions.deniedTitle" : "subscriptions.loadError")}
              description={t(denied ? "subscriptions.deniedBody" : "subscriptions.loadErrorBody")}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {t("subscriptions.retry")}
                  </Button>
                )
              }
            />
          );
        })()
      ) : rows.length === 0 ? (
        <EmptyState
          tone="empty"
          icon={BookMarked}
          title={t("subscriptions.notFound")}
          description={t("subscriptions.emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                {COLS.map((c) => (
                  <TableHead key={c} className={c === "price" ? "h-[34px] px-3 text-end" : "h-[34px] px-3"}>
                    <Eyebrow locale={locale} marker={false}>
                      {t(asKey(`subscriptions.${c}`))}
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
                  <TableCell className="px-3 py-[7px]">
                    <IdentityCell
                      initials={initialsOf(r.studentName ?? "—")}
                      name={r.studentName ?? "—"}
                      meta={r.studentEmail ? <Num.Code>{r.studentEmail}</Num.Code> : undefined}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{r.courseTitle ?? "—"}</TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <div className="text-[13px] text-ink">
                      {r.targetType === "center" ? (r.centerName ?? "—") : (r.teacherName ?? "—")}
                    </div>
                    <div className="text-[11px] text-ink-3">{t(asKey(`targets.${r.targetType}`))}</div>
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{t(asKey(`plans.${r.plan}`))}</TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money piasters={r.price} locale={locale} tone="net" sign={false} />
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{t(asKey(`sources.${r.source}`))}</TableCell>
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
                  {t("subscriptions.prev")}
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  {t("subscriptions.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
                <StatusBadge tone={STATUS_TONE[d.status] ?? "neutral"}>
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
              {/* Lineage — the three records that prove the coverage is real. */}
              <Row label={t("subscriptions.receipt")}>
                {d.payment?.receiptNumber ? <Num.Code>{d.payment.receiptNumber}</Num.Code> : "—"}
              </Row>
              <Row label={t("subscriptions.paymentIntent")}>
                {d.intent ? (
                  <span className="inline-flex items-baseline gap-1.5">
                    <Num.Code>{d.intent.id.slice(0, 8)}</Num.Code>
                    <StatusBadge tone={STATUS_TONE[d.intent.status] ?? "neutral"}>
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
