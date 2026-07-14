"use client";

import { useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Building2, Check, X } from "lucide-react";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

type Affiliation = {
  _id?: string;
  id?: string;
  status: "pending" | "active" | "declined" | "expired" | "removed";
  expiresAt?: string;
  invitedAt?: string;
  respondedAt?: string;
  center?: { name: string; shortId?: string };
};

const statusTone: Record<Affiliation["status"], StatusTone> = {
  pending: "info",
  active: "success",
  declined: "neutral",
  expired: "neutral",
  removed: "neutral",
};

export function TeacherAffiliationsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { query, result } = useCustom<Affiliation[]>({ url: "me/affiliations", method: "get" });
  const { mutate, mutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const affiliations: Affiliation[] = Array.isArray(result?.data)
    ? (result.data as Affiliation[])
    : [];

  const statusLabel = (s: Affiliation["status"]): string => {
    if (s === "pending") return t("status.pending");
    if (s === "active") return t("status.active");
    if (s === "declined") return t("teacher.statusDeclined");
    if (s === "expired") return t("teacher.statusExpired");
    return t("teacher.statusRemoved");
  };

  const handleAction = (id: string, action: "accept" | "decline") => {
    mutate(
      { url: `affiliations/${id}/${action}`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(action === "accept" ? t("teacher.invitationAccepted") : t("teacher.invitationDeclined"));
          invalidate({ resource: "me-affiliations", invalidates: ["all"] });
          query.refetch?.();
        },
        onError: (err) => toast.error((err as { message?: string })?.message || t("teacher.actionFailed")),
      },
    );
  };

  const columns: ColumnDef<Affiliation>[] = [
    {
      id: "center",
      header: t("teacher.center"),
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-info" />
            <span className="font-semibold text-foreground">{a.center?.name ?? t("teacher.unknownCenter")}</span>
            {a.center?.shortId && (
              <span className="text-xs text-muted-foreground">#{a.center.shortId}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("teacher.status"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone[row.original.status]}>{statusLabel(row.original.status)}</StatusBadge>
      ),
    },
    {
      id: "invitedAt",
      header: t("teacher.invited"),
      cell: ({ row }) => (row.original.invitedAt ? formatDate(row.original.invitedAt) : "—"),
    },
    {
      id: "expiresAt",
      header: t("teacher.expires"),
      cell: ({ row }) => {
        const a = row.original;
        if (a.status !== "pending" || !a.expiresAt) return "—";
        const exp = dayjs(a.expiresAt);
        const days = exp.diff(dayjs(), "day");
        return (
          <span className={cn(days <= 2 && "text-destructive")}>
            {formatDate(a.expiresAt)}
            {days >= 0 ? (
              <>
                {" · "}
                <span dir="ltr">{days}</span> {t("teacher.daysLeft")}
              </>
            ) : (
              ` · ${t("teacher.expiredLabel")}`
            )}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: t("teacher.actions"),
      cell: ({ row }) => {
        const a = row.original;
        if (a.status !== "pending") return null;
        const id = a.id || a._id || "";
        return (
          <div className="flex items-center gap-2">
            <ConfirmDialog
              trigger={
                <Button size="sm" disabled={mutation.isPending}>
                  {mutation.isPending ? <Spinner /> : <Check className="size-4" />}
                  {t("teacher.accept")}
                </Button>
              }
              title={t("teacher.acceptConfirm")}
              description={t("teacher.acceptConfirmDesc")}
              confirmText={t("teacher.accept")}
              onConfirm={() => handleAction(id, "accept")}
            />
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="destructive">
                  <X className="size-4" />
                  {t("teacher.decline")}
                </Button>
              }
              title={t("teacher.declineConfirm")}
              confirmText={t("teacher.decline")}
              destructive
              onConfirm={() => handleAction(id, "decline")}
            />
          </div>
        );
      },
    },
  ];

  const pendingCount = affiliations.filter((a) => a.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{t("teacher.myCenters")}</CardTitle>
          {pendingCount > 0 && (
            <StatusBadge tone="info">
              <span dir="ltr">{pendingCount}</span> {t("teacher.pendingLabel")}
            </StatusBadge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <PageSpinner label={t("common.loading")} />
        ) : affiliations.length === 0 ? (
          <EmptyState icon={Building2} title={t("teacher.noAffiliations")} />
        ) : (
          <DataTable
            columns={columns}
            data={affiliations}
            pageSize={Math.max(affiliations.length, 1)}
            emptyState={t("teacher.noAffiliations")}
          />
        )}
      </CardContent>
    </Card>
  );
}
