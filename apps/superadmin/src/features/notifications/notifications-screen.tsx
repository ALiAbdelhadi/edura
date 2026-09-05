"use client";

import React from "react";
import { useList, useInvalidate } from "@refinedev/core";
import { useRouter } from "@/i18n/navigation";
import { Bell, Check, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { ProseCount } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useAction } from "@/lib/api/use-action";
import { useFormatters } from "@/lib/i18n/use-formatters";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export type StaffPortal = "superadmin" | "finance";

const TYPE_TONE: Record<string, StatusTone> = {
  chat_report_filed: "danger",
  blacklist_action: "danger",
  registration_rejected: "danger",
  registration_approved: "success",
  payout_approved: "success",
  payout_paid: "success",
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

const TYPE_ROUTE: Record<string, string> = {
  chat_report_filed: "messaging",
  new_chat_message: "messaging",
  chat_group_message: "messaging",
  payment_recorded: "payments",
  payment_refunded: "payments",
  payout_approved: "payouts",
  payout_paid: "payouts",
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

/**
 * One clock for the whole list, sampled on a minute tick.
 *
 * `Date.now()` in a render body is non-idempotent, and TimeAgo renders once
 * per row -- so the labels were whatever the clock happened to say at each
 * unrelated re-render. Snapshotting inside TimeAgo instead would have frozen
 * every row at mount, which is worse for a relative time: a panel left open
 * would still read "just now" an hour later. Lifting it means the rows are a
 * pure function of `now`, and they all move together, once a minute.
 */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function TimeAgo({
  dateStr,
  locale,
  now,
}: {
  dateStr: string;
  locale: Locale;
  now: number;
}) {
  const t = useTranslations("shared");
  const diff = now - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return <>{t("timeJustNow")}</>;

  const [count, stem] =
    m < 60
      ? [m, "timeMin"]
      : Math.floor(m / 60) < 24
        ? [Math.floor(m / 60), "timeHour"]
        : [Math.floor(m / 1440), "timeDay"];

  return (
    <>
      {t("timeAgoPrefix")}{" "}
      <ProseCount
        count={count}
        locale={locale}
        forms={{
          one: t(asKey(`${stem}_one`)),
          two: t.has(asKey(`${stem}_two`)) ? t(asKey(`${stem}_two`)) : undefined,
          few: t.has(asKey(`${stem}_few`)) ? t(asKey(`${stem}_few`)) : undefined,
          many: t(asKey(`${stem}_many`)),
        }}
      />
    </>
  );
}

export function NotificationsScreen({ portal }: { portal: StaffPortal }) {
  const t = useTranslations();
  const { formatNumber } = useFormatters();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const invalidate = useInvalidate();
  const now = useNow();
  const basePath = `/dashboard/${portal}`;

  const { query, result } = useList<Notification>({
    resource: "notifications",
    pagination: { currentPage: 1, pageSize: 50 },
  });
  const notifications = (result?.data ?? []) as Notification[];

  const refreshAll = () =>
    invalidate({ resource: "notifications", invalidates: ["list"] });

  const { run: markReadMut } = useAction({ onSuccess: refreshAll });
  const { run: markAllReadMut, busy: markingAll } = useAction({
    url: "notifications/read-all",
    onSuccess: refreshAll,
  });

  const getNotificationLink = (n: Notification): string | null => {
    const segment = TYPE_ROUTE[n.type];
    if (!segment || !PORTAL_ROUTES[portal].has(segment)) return null;
    return `${basePath}/${segment}`;
  };

  const markRead = (id: string) =>
    markReadMut({ url: `notifications/${id}/read`, values: {} });

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markRead(n.id);
    const link = getNotificationLink(n);
    if (link) router.push(link);
  };

  // `run` is re-entrant-safe, so the old `if (markingAll) return` guard is
  // now the hook's job.
  const markAllRead = () => markAllReadMut({ values: {} });

  if (query.isLoading && notifications.length === 0) {
    return <PageSpinner label={t("common.loading")} />;
  }

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
            <Button
              size="sm"
              variant="outline"
              disabled={markingAll}
              onClick={() => void markAllRead()}
            >
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
              {...(clickable
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    onClick: () => handleNotificationClick(n),
                    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      handleNotificationClick(n);
                    },
                  }
                : {})}
              className={cn(
                "border-s-2 py-0 transition-colors",
                clickable &&
                  "focus-ledger cursor-pointer hover:border-indigo/40 hover:bg-accent",
                n.read ? "border-s-transparent bg-field/50" : "border-s-primary",
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm",
                          n.read ? "font-normal text-ink-2" : "font-semibold",
                        )}
                      >
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="size-2 shrink-0 rounded-full bg-amber" role="status">
                          <span className="sr-only">{t("shared.notifUnread")}</span>
                        </span>
                      )}
                    </div>
                    <p className="m-0 text-[13px] text-ink-2">
                      {n.body}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <StatusBadge tone={tone}>{typeText}</StatusBadge>
                    <div className="mt-1 text-[11px] text-ink-2">
                      <TimeAgo dateStr={n.createdAt} locale={locale} now={now} />
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
