"use client";

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { Search, X, BookMarked } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useTranslations } from "next-intl";

const ANY = "__any__";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  active: "success",
  cancelled: "danger",
  pending_payment: "warning",
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
  const { formatEGP, formatDate } = useFormatters();
  const t = useTranslations();
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
      ...(targetType
        ? [{ field: "targetType", operator: "eq" as const, value: targetType }]
        : []),
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

  const filterSelect = (
    label: string,
    value: string | null,
    set: (v: string | null) => void,
    options: string[],
  ) => (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => {
        set(v === ANY ? null : v);
        setPage(1);
      }}
    >
      <SelectTrigger className="w-40">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("subscriptions.title")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("subscriptions.searchPlaceholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="ps-9 pe-9"
            />
            {q && (
              <button
                type="button"
                aria-label={t("subscriptions.clearSearch")}
                onClick={() => setQ("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {filterSelect(t("subscriptions.status"), status, setStatus, [
            "pending_payment",
            "active",
            "expired",
            "cancelled",
          ])}
          {filterSelect(t("subscriptions.plan"), plan, setPlan, ["monthly", "per_session"])}
          {filterSelect(t("subscriptions.source"), source, setSource, ["online", "walk_in"])}
          {filterSelect(t("subscriptions.target"), targetType, setTargetType, ["center", "teacher"])}
        </CardContent>
      </Card>

      {query.isLoading && <PageSpinner label={t("subscriptions.loading")} />}

      {!query.isLoading && rows.length === 0 && (
        <EmptyState icon={BookMarked} title={t("subscriptions.notFound")} />
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("subscriptions.student")}</TableHead>
                <TableHead>{t("subscriptions.course")}</TableHead>
                <TableHead>{t("subscriptions.target")}</TableHead>
                <TableHead>{t("subscriptions.plan")}</TableHead>
                <TableHead>{t("subscriptions.price")}</TableHead>
                <TableHead>{t("subscriptions.source")}</TableHead>
                <TableHead>{t("subscriptions.status")}</TableHead>
                <TableHead>{t("subscriptions.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                  <TableCell>
                    <div className="font-medium">{r.studentName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.studentEmail}</div>
                  </TableCell>
                  <TableCell>{r.courseTitle ?? "—"}</TableCell>
                  <TableCell>
                    {r.targetType === "center" ? (r.centerName ?? "center") : (r.teacherName ?? "teacher")}
                    <div className="text-xs text-muted-foreground">{r.targetType}</div>
                  </TableCell>
                  <TableCell>{r.plan}</TableCell>
                  <TableCell className="font-semibold">{formatEGP(r.price)}</TableCell>
                  <TableCell>{r.source}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("subscriptions.pageInfo", { page, pageCount, total })}
          </span>
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
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("subscriptions.detailTitle")}</DialogTitle>
          </DialogHeader>
          {d ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("subscriptions.subId")}</dt>
              <dd className="font-mono text-xs">{d.id}</dd>
              <dt className="text-muted-foreground">{t("subscriptions.student")}</dt>
              <dd>
                {d.student?.name} <span className="text-muted-foreground">({d.student?.email})</span>
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.targetVal")}</dt>
              <dd>
                {d.targetType === "center" ? d.center?.name : d.teacher?.name}{" "}
                <span className="text-muted-foreground">({d.targetType})</span>
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.course")}</dt>
              <dd>
                {d.course?.title ?? "—"}
                {d.course?.location ? (
                  <span className="text-muted-foreground"> · {d.course.location}</span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.planPrice")}</dt>
              <dd>
                {d.plan} · <span className="font-semibold">{formatEGP(d.price)}</span>
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.status")}</dt>
              <dd>
                <StatusBadge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</StatusBadge>
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.sourceMethod")}</dt>
              <dd>
                {d.source} / {d.paymentMethod ?? "—"}
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.coverage")}</dt>
              <dd>
                {d.plan === "monthly"
                  ? d.periodStart
                    ? `${formatDate(d.periodStart)} → ${formatDate(d.periodEnd)}`
                    : "—"
                  : (d.sessionId ?? "—")}
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.receipt")}</dt>
              <dd>{d.payment?.receiptNumber ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("subscriptions.paymentIntent")}</dt>
              <dd className="font-mono text-xs">
                {d.intent ? `${d.intent.id.slice(0, 8)} (${d.intent.status})` : "—"}
              </dd>
              <dt className="text-muted-foreground">{t("subscriptions.enrollment")}</dt>
              <dd>{d.enrollment ? `${d.enrollment.status}` : "—"}</dd>
              <dt className="text-muted-foreground">{t("subscriptions.createdActivated")}</dt>
              <dd>
                {formatDate(d.createdAt)}
                {d.activatedAt ? ` → ${formatDate(d.activatedAt)}` : ""}
              </dd>
            </dl>
          ) : (
            <PageSpinner label={t("common.loading")} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
