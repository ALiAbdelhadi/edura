"use client";

import { useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import { Building2, Check, X } from "lucide-react";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { QuerySection } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";
import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";

type Affiliation = {
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

  const affiliations = asArray<Affiliation>(result?.data);

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
          invalidate({ resource: "me-affiliations", invalidates: ["list"] });
          query.refetch?.();
        },
        onError: (err) => toast.error((err as { message?: string })?.message || t("teacher.actionFailed")),
      },
    );
  };

  const pendingCount = affiliations.filter((a) => a.status === "pending").length;

  const expiryNote = (a: Affiliation) => {
    if (a.status !== "pending" || !a.expiresAt) return null;
    const days = dayjs(a.expiresAt).diff(dayjs(), "day");
    return (
      <span className={cn("text-xs", days <= 2 ? "text-destructive" : "text-muted-foreground")}>
        {t("teacher.expires")}: {formatDate(a.expiresAt)}
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
  };

  return (
    <div className="space-y-6">
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
        <CardContent className="px-0">
          <QuerySection
            query={query}
            skeleton={<PageSpinner label={t("common.loading")} />}
            className="mx-6"
            isEmpty={affiliations.length === 0}
            empty={
              <div className="px-6">
                <EmptyState icon={Building2} title={t("teacher.noAffiliations")} />
              </div>
            }
          >
            <ul className="divide-y divide-border border-y border-border">
              {affiliations.map((a) => {
                const id = a.id || "";
                return (
                  <li key={id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Building2 className="size-4 shrink-0 text-info" />
                        <span className="truncate font-semibold text-foreground">
                          {a.center?.name ?? t("teacher.unknownCenter")}
                        </span>
                        {a.center?.shortId ? (
                          <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                            #{a.center.shortId}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge tone={statusTone[a.status]}>{statusLabel(a.status)}</StatusBadge>
                        {a.invitedAt ? (
                          <span className="text-xs text-muted-foreground">
                            {t("teacher.invited")}: {formatDate(a.invitedAt)}
                          </span>
                        ) : null}
                        {expiryNote(a)}
                      </span>
                    </span>

                    {a.status === "pending" ? (
                      <span className="flex shrink-0 items-center gap-2">
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
                            <Button size="sm" variant="destructive" disabled={mutation.isPending}>
                              <X className="size-4" />
                              {t("teacher.decline")}
                            </Button>
                          }
                          title={t("teacher.declineConfirm")}
                          confirmText={t("teacher.decline")}
                          destructive
                          onConfirm={() => handleAction(id, "decline")}
                        />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </QuerySection>
        </CardContent>
      </Card>

      <CollaborationPanel role="teacher" />
    </div>
  );
}
