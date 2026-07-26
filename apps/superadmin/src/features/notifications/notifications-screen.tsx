"use client";

import React from "react";
import { useList, useCustomMutation, useInvalidate } from "@refinedev/core";
import { useRouter } from "next/navigation";
import { Bell, Check, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
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

/** Staff portals this screen serves. Each maps to its own route namespace. */
export type StaffPortal = "superadmin" | "finance";

const TYPE_TONE: Record<string, StatusTone> = {
  chat_report_filed: "danger",
  blacklist_action: "danger",
  registration_rejected: "danger",
  registration_approved: "success",
  payout_approved: "success",
  payment_recorded: "success",
  payment_refunded: "warning",
  session_cancelled: "warning",
  guardian_contact_required: "warning",
  admin_broadcast: "primary",
  enrollment_request_approved: "primary",
  classroom_request: "info",
  classroom_request_decided: "info",
  absence_marked: "info",
  grade_entered: "info",
  default: "neutral",
};

/**
 * Notification type -> route segment under the portal's base path. A segment is
 * only linked when the portal actually has that screen (see PORTAL_ROUTES) —
 * the accountant portal is finance-only, so anything outside it stays inert
 * rather than sending them to a 404 or a screen the API would reject.
 */
const TYPE_ROUTE: Record<string, string> = {
  chat_report_filed: "messaging",
  new_chat_message: "messaging",
  chat_group_message: "messaging",
  payment_recorded: "payments",
  payment_refunded: "payments",
  payout_approved: "payouts",
  registration_approved: "registrations",
  registration_rejected: "registrations",
  teacher_invited: "teachers",
  classroom_request: "collaborations",
  classroom_request_decided: "collaborations",
  invite_code_sent: "whatsapp",
};

const PORTAL_ROUTES: Record<StaffPortal, ReadonlySet<string>> = {
  superadmin: new Set([
    "registrations",
    "catalog",
    "centers",
    "teachers",
    "payments",
    "subscriptions",
    "collaborations",
    "payouts",
    "settlements",
    "commission",
    "wallet",
    "whatsapp",
    "messaging",
  ]),
  finance: new Set(["payments", "subscriptions", "payouts", "commission"]),
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

export function NotificationsScreen({ portal }: { portal: StaffPortal }) {
  const t = useTranslations();
  const { formatNumber } = useFormatters();
  const router = useRouter();
  const invalidate = useInvalidate();
  const basePath = `/dashboard/${portal}`;

  const { query, result } = useList<Notification>({
    resource: "notifications",
    pagination: { currentPage: 1, pageSize: 50 },
  });
  const notifications = (result?.data ?? []) as Notification[];

  const { mutateAsync: markReadMut } = useCustomMutation();
  const { mutateAsync: markAllReadMut } = useCustomMutation();

  // Refresh this list AND the header/sidebar unread badge, which is a separate
  // query in DashboardShell — refetching only the local list left it stale.
  const refreshAll = () =>
    invalidate({ resource: "notifications", invalidates: ["list"] });

  const getNotificationLink = (n: Notification): string | null => {
    const segment = TYPE_ROUTE[n.type];
    if (!segment || !PORTAL_ROUTES[portal].has(segment)) return null;
    return `${basePath}/${segment}`;
  };

  const markRead = async (id: string) => {
    try {
      await markReadMut({
        url: `notifications/${id}/read`,
        method: "post",
        values: {},
      });
      refreshAll();
    } catch {
      toast.error(t("common.failed"));
    }
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
      refreshAll();
    } catch {
      toast.error(t("common.failed"));
    }
  };

  if (query.isLoading && notifications.length === 0) {
    return <PageSpinner label={t("common.loading")} />;
  }

  // A failed list query used to fall through to the empty state, so a broken
  // API was indistinguishable from "you have no notifications" — the reason a
  // hard 404 on this resource looked like a blank page instead of an error.
  if (query.isError && notifications.length === 0) {
    return (
      <div className="flex w-full max-w-[640px] flex-col gap-6">
        <PageHeader title={t("nav.notifications")} />
        <EmptyState
          icon={TriangleAlert}
          title={t("common.genericError")}
          action={
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              {t("actions.retry")}
            </Button>
          }
        />
      </div>
    );
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
          const clickable = !n.read || getNotificationLink(n) !== null;
          return (
            <Card
              key={n.id}
              onClick={
                clickable ? () => handleNotificationClick(n) : undefined
              }
              className={cn(
                "border-s-2 py-0 transition-colors",
                clickable && "cursor-pointer hover:border-primary/40 hover:bg-accent",
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
