"use client";

import React from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { useRouter, useParams } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const TYPE_TONE: Record<string, StatusTone> = {
  absence_marked: "info",
  session_cancelled: "warning",
  payment_recorded: "success",
  enrollment_request_approved: "primary",
  grade_posted: "info",
  default: "neutral",
};

function timeAgo(
  dateStr: string,
  t: ReturnType<typeof useTranslations<never>>,
  formatNumber: (n: number | null | undefined) => string,
): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("shared.timeJustNow");
  if (m < 60) return t("shared.timeMinutesAgo", { n: formatNumber(m) });
  const h = Math.floor(m / 60);
  if (h < 24) return t("shared.timeHoursAgo", { n: formatNumber(h) });
  return t("shared.timeDaysAgo", { n: formatNumber(Math.floor(h / 24)) });
}

export function NotificationsScreen() {
  const t = useTranslations();
  const { formatNumber } = useFormatters();
  const router = useRouter();
  const params = useParams();
  const role = (params?.role as string) || "student";
  const basePath = `/dashboard/${role === "center_admin" ? "admin" : role}`;

  const { query, result } = useList<Notification>({
    resource: "notifications",
    pagination: { mode: "off" },
  });
  const notifications = (result?.data ?? []) as Notification[];

  const { mutateAsync: markReadMut } = useCustomMutation();
  const { mutateAsync: markAllReadMut } = useCustomMutation();

  const getNotificationLink = (n: Notification): string | null => {
    const d = (n as any).data || {};
    switch (n.type) {
      case "payment_recorded":
        return `${basePath}/fees`;
      case "enrollment_request_approved":
      case "enrollment_request_declined":
        return `${basePath}/courses`;
      case "material_uploaded":
        return `${basePath}/materials`;
      case "session_cancelled":
      case "session_postponed":
        return `${basePath}/schedule`;
      case "grade_posted":
      case "grade_entered":
        return `${basePath}/grades`;
      case "absence_marked":
      case "attendance_corrected":
        return `${basePath}/attendance`;
      default:
        return null;
    }
  };

  const markRead = async (id: string) => {
    try {
      await markReadMut({
        url: `notifications/${id}/read`,
        method: "post",
        values: {},
      });
      query.refetch();
    } catch {}
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markRead(n.id);
    const link = getNotificationLink(n);
    if (link) router.push(link);
  };

  const markAllRead = async () => {
    try {
      await markAllReadMut({
        url: "notifications/read-all",
        method: "post",
        values: {},
      });
      query.refetch();
    } catch {}
  };

  if (query.isLoading && notifications.length === 0) {
    return <PageSpinner label={t("common.loading")} />;
  }

  const unread = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    return (
      <div className="flex w-full max-w-[640px] flex-col gap-6">
        <PageHeader title={t("nav.notifications")} />
        <EmptyState icon={Bell} title={t("shared.notifEmpty")} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-6">
      <PageHeader
        title={t("nav.notifications")}
        description={
          unread > 0
            ? t("shared.notifUnreadCount", { n: formatNumber(unread) })
            : undefined
        }
        actions={
          unread > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              <Check className="size-4" />
              {t("shared.notifMarkAllRead")}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3">
        {notifications.map((n) => {
          const tone = TYPE_TONE[n.type] ?? TYPE_TONE.default;
          const typeKey = `shared.notifType_${n.type}`;
          const typeLabel = t.has(asKey(typeKey)) ? t(asKey(typeKey)) : null;
          const typeText = typeLabel ?? n.type.replace(/_/g, " ");
          return (
            <Card
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={cn(
                "cursor-pointer border-s-2 py-0 transition-colors hover:border-primary/40 hover:bg-accent",
                n.read ? "border-s-transparent opacity-65" : "border-s-primary",
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          n.read ? "font-normal" : "font-semibold",
                        )}
                      >
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="size-2 shrink-0 rounded-full bg-info" />
                      )}
                    </div>
                    <p className="m-0 text-[13px] text-muted-foreground">
                      {n.body}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <StatusBadge tone={tone}>{typeText}</StatusBadge>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {timeAgo(n.createdAt, t, formatNumber)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
