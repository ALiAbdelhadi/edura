"use client";

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { Search, X, Handshake } from "lucide-react";
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
  accepted: "success",
  rejected: "danger",
  cancelled: "danger",
  pending: "warning",
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
  const { formatEGP, formatDate } = useFormatters();
  const t = useTranslations();
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
        <SelectItem value={ANY}>{label}: {t("collabRequests.any")}</SelectItem>
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
      <PageHeader title={t("collabRequests.title")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("collabRequests.searchPlaceholder")}
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
                aria-label={t("collabRequests.clearSearch")}
                onClick={() => setQ("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {filterSelect(t("collabRequests.status"), status, setStatus, [
            "pending",
            "accepted",
            "rejected",
            "cancelled",
            "expired",
          ])}
          {filterSelect(t("collabRequests.initiator"), initiator, setInitiator, [
            "teacher",
            "center",
          ])}
        </CardContent>
      </Card>

      {query.isLoading && <PageSpinner label={t("collabRequests.loading")} />}

      {!query.isLoading && rows.length === 0 && (
        <EmptyState icon={Handshake} title={t("collabRequests.notFound")} />
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("collabRequests.teacher")}</TableHead>
                <TableHead>{t("collabRequests.center")}</TableHead>
                <TableHead>{t("collabRequests.subject")}</TableHead>
                <TableHead>{t("collabRequests.schedule")}</TableHead>
                <TableHead>{t("collabRequests.share")}</TableHead>
                <TableHead>{t("collabRequests.initiator")}</TableHead>
                <TableHead>{t("collabRequests.status")}</TableHead>
                <TableHead>{t("collabRequests.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                  <TableCell className="font-medium">{r.teacherName ?? "—"}</TableCell>
                  <TableCell>{r.centerName ?? "—"}</TableCell>
                  <TableCell>{r.subjectName ?? "—"}</TableCell>
                  <TableCell className="text-xs" dir="ltr">
                    {r.startTime}–{r.endTime}
                  </TableCell>
                  <TableCell className="font-semibold">{formatEGP(r.proposedCenterShare)}</TableCell>
                  <TableCell>{r.initiator}</TableCell>
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
            {t("collabRequests.pageOf", { page, pageCount, total })}
          </span>
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

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("collabRequests.detailTitle")}</DialogTitle>
          </DialogHeader>
          {d ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("collabRequests.teacher")}</dt>
              <dd>
                {d.teacher?.name}{" "}
                <span className="text-muted-foreground">({d.teacher?.email})</span>
              </dd>
              <dt className="text-muted-foreground">{t("collabRequests.center")}</dt>
              <dd>{d.center?.name ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("collabRequests.subject")}</dt>
              <dd>
                {d.subject?.nameEn ?? d.subject?.nameAr} · {d.grade?.nameEn ?? d.grade?.nameAr}
              </dd>
              <dt className="text-muted-foreground">{t("collabRequests.schedule")}</dt>
              <dd dir="ltr">
                {d.startTime}–{d.endTime} · {formatDate(d.startDate)}
              </dd>
              <dt className="text-muted-foreground">{t("collabRequests.share")}</dt>
              <dd className="font-semibold">{formatEGP(d.proposedCenterShare)}</dd>
              <dt className="text-muted-foreground">{t("collabRequests.expected")}</dt>
              <dd>{d.expectedStudents ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("collabRequests.initiator")}</dt>
              <dd>{d.initiator}</dd>
              <dt className="text-muted-foreground">{t("collabRequests.status")}</dt>
              <dd>
                <StatusBadge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</StatusBadge>
                {d.responseNote ? (
                  <span className="ms-2 text-destructive">{d.responseNote}</span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">{t("collabRequests.createdCourse")}</dt>
              <dd>{d.course ? `${d.course.title} (${d.course.status})` : "—"}</dd>
              <dt className="text-muted-foreground">{t("collabRequests.affiliation")}</dt>
              <dd>
                {d.affiliation
                  ? `${d.affiliation.status} · ${formatEGP(d.affiliation.centerShare ?? 0)}`
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">{t("collabRequests.message")}</dt>
              <dd>{d.message ?? "—"}</dd>
            </dl>
          ) : (
            <PageSpinner label={t("collabRequests.loading")} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
