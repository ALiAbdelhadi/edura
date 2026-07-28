"use client";

// Notifications — rendered by all six portals.
//
// Two things were fixed here alongside the Ledger conversion, both of them
// accessibility defects rather than styling:
//
// 1. The row was a <div> with an onClick and `cursor-pointer`. It had no role,
//    no tabIndex and no key handler, so notifications could not be opened by
//    keyboard at all. It is a <button> now.
// 2. Unread was signalled by a bare coloured dot with no text equivalent —
//    the same defect the audit found on the pending-registrations indicator.
//    The dot is now decorative (aria-hidden) and the state is carried by real
//    text for assistive tech.
//
// Colour discipline: the type chip is a CATEGORY, not a state, so it is
// neutral — except money, which is the one category where this system's colour
// already means something. Emphasis belongs to unread vs read, and that is the
// indigo bar. A rainbow of type chips would spend every semantic at once.
import React from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { useRouter, useParams } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { Figure, SkeletonRows } from "@repo/ui/components/ledger";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
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

/** Money is the one category whose colour already carries meaning here. */
const MONEY_TYPES = new Set(["payment_recorded", "payout_settled", "refund_issued"]);

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
    return <SkeletonRows rows={5} className="max-w-[640px]" />;
  }

  const unread = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    return (
      <div className="flex w-full max-w-[640px] flex-col gap-5">
        <PageHeader title={t("nav.notifications")} />
        <EmptyState icon={Bell} title={t("shared.notifEmpty")} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-5">
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

      <ul className="flex flex-col gap-2">
        {notifications.map((n) => {
          const typeKey = `shared.notifType_${n.type}`;
          const typeLabel = t.has(asKey(typeKey)) ? t(asKey(typeKey)) : null;
          const typeText = typeLabel ?? n.type.replace(/_/g, " ");
          const isMoney = MONEY_TYPES.has(n.type);
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void handleNotificationClick(n)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-xl border border-rule bg-sheet p-3 text-start transition-colors",
                  "border-s-[3px] hover:bg-rule-2",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                  n.read ? "border-s-rule" : "border-s-indigo",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[13px] text-ink",
                        n.read ? "font-normal" : "font-semibold",
                      )}
                    >
                      {n.title}
                    </span>
                    {!n.read ? (
                      <>
                        {/* Decorative twin of the text below it. */}
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-indigo"
                        />
                        <span className="sr-only">
                          {t("shared.notifUnreadLabel")}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <p className="m-0 text-[12px] leading-relaxed text-ink-2">
                    {n.body}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      isMoney
                        ? "bg-teal-soft text-teal"
                        : "bg-rule-2 text-ink-2",
                    )}
                  >
                    {typeText}
                  </span>
                  <Figure className="text-[10px] text-ink-3">
                    {timeAgo(n.createdAt, t, formatNumber)}
                  </Figure>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
