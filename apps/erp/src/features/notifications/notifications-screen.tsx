"use client";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { usePathname, useRouter } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustomMutation, useList } from "@refinedev/core";
import {
  NOTIFICATION_PORTALS,
  notificationPath,
  portalForRole,
  type NotificationPortal,
} from "@repo/server-core/services/notifications/deep-link";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";
import {
  Bell,
  BookOpen,
  Calendar,
  CalendarClock,
  CalendarX,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileText,
  Flag,
  GraduationCap,
  KeyRound,
  MailWarning,
  Megaphone,
  MessageCircle,
  ShieldAlert,
  StickyNote,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const TYPE_META: Record<string, { tone: StatusTone; icon: LucideIcon }> = {
  absence_marked: { tone: "warning", icon: UserX },
  admin_broadcast: { tone: "primary", icon: Megaphone },
  attendance_corrected: { tone: "info", icon: UserCheck },
  blacklist_action: { tone: "danger", icon: ShieldAlert },
  chat_group_message: { tone: "info", icon: MessageCircle },
  chat_report_filed: { tone: "danger", icon: Flag },
  classroom_request: { tone: "neutral", icon: DoorOpen },
  classroom_request_decided: { tone: "success", icon: CheckCircle2 },
  course_cancelled: { tone: "danger", icon: CalendarX },
  enrollment_request_approved: { tone: "success", icon: CheckCircle2 },
  enrollment_request_declined: { tone: "danger", icon: XCircle },
  enrollment_request_submitted: { tone: "neutral", icon: Clock },
  enrollment_restored_over_capacity: { tone: "warning", icon: Users },
  grade_entered: { tone: "info", icon: GraduationCap },
  grade_posted: { tone: "info", icon: GraduationCap },
  guardian_contact_required: { tone: "warning", icon: MailWarning },
  homework_deadline: { tone: "warning", icon: BookOpen },
  invite_code_sent: { tone: "neutral", icon: UserPlus },
  lesson_reminder: { tone: "info", icon: Calendar },
  material_uploaded: { tone: "neutral", icon: FileText },
  new_chat_message: { tone: "info", icon: MessageCircle },
  parent_link_requested: { tone: "neutral", icon: Users },
  password_reset_requested: { tone: "warning", icon: KeyRound },
  payment_recorded: { tone: "success", icon: Wallet },
  payment_refunded: { tone: "info", icon: Wallet },
  payout_approved: { tone: "success", icon: Wallet },
  registration_approved: { tone: "success", icon: CheckCircle2 },
  registration_rejected: { tone: "danger", icon: XCircle },
  session_cancelled: { tone: "danger", icon: CalendarX },
  session_postponed: { tone: "warning", icon: CalendarClock },
  shell_activation_invite: { tone: "neutral", icon: UserPlus },
  student_added_to_roster: { tone: "neutral", icon: UserPlus },
  teacher_invited: { tone: "neutral", icon: UserPlus },
  team_note_created: { tone: "primary", icon: StickyNote },
  team_note_status_changed: { tone: "info", icon: StickyNote },
  default: { tone: "neutral", icon: Bell },
};

const TONE_CIRCLE: Record<StatusTone, string> = {
  pending: "bg-amber-soft text-amber",
  paid: "bg-teal-soft text-teal",
  rejected: "bg-red-soft text-red",
  active: "bg-indigo-soft text-indigo",
  neutral: "bg-field text-ink-2",
  success: "bg-teal-soft text-teal",
  warning: "bg-amber-soft text-amber",
  info: "bg-indigo-soft text-indigo",
  danger: "bg-red-soft text-red",
  primary: "bg-indigo-soft text-indigo",
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

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
  const [tab, setTab] = useState<"all" | "unread">("all");
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const portalFromPath = pathname?.split("/dashboard/")[1]?.split("/")[0];
  const portal = NOTIFICATION_PORTALS.includes(
    portalFromPath as NotificationPortal,
  )
    ? (portalFromPath as NotificationPortal)
    : portalForRole((params?.role as string) ?? null);

  const { query, result } = useList<Notification>({
    resource: "notifications",
    pagination: { mode: "off" },
  });
  const notifications = (result?.data ?? []) as Notification[];

  const { mutateAsync: markReadMut } = useCustomMutation();
  const { mutateAsync: markAllReadMut } = useCustomMutation();

  const getNotificationLink = (n: Notification): string | null =>
    notificationPath(n.type, portal);

  const markRead = async (id: string) => {
    try {
      await markReadMut({
        url: `notifications/${id}/read`,
        method: "post",
        values: {},
      });
      query.refetch();
    } catch { }
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
    } catch { }
  };

  const unread = notifications.filter((n) => !n.read).length;
  const visible = tab === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const groups = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const buckets: { key: "today" | "yesterday" | "earlier"; items: Notification[] }[] = [
      { key: "today", items: [] },
      { key: "yesterday", items: [] },
      { key: "earlier", items: [] },
    ];
    for (const n of visible) {
      const created = new Date(n.createdAt);
      const bucket = isSameDay(created, now)
        ? buckets[0]
        : isSameDay(created, yesterday)
          ? buckets[1]
          : buckets[2];
      bucket.items.push(n);
    }
    return buckets.filter((b) => b.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (query.isLoading && notifications.length === 0) {
    return <PageSpinner label={t("common.loading")} />;
  }

  if (notifications.length === 0) {
    return (
      <div className="flex w-full max-w-[640px] flex-col gap-6">
        <PageHeader title={t("nav.notifications")} />
        <EmptyState icon={Bell} title={t("shared.notifEmpty")} />
      </div>
    );
  }

  const GROUP_LABEL: Record<(typeof groups)[number]["key"], string> = {
    today: t("shared.notifGroupToday"),
    yesterday: t("shared.notifGroupYesterday"),
    earlier: t("shared.notifGroupEarlier"),
  };

  return (
    <div className="flex w-full mx-auto flex-col gap-6">
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
              onClick={markAllRead}
              className="gap-2"
            >
              <CheckCheck className="size-4" />
              {t("shared.notifMarkAllRead")}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-5">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "all" | "unread")}
        >
          <TabsList className="h-9 w-fit">
            <TabsTrigger value="all" className="px-3">
              {t("shared.notifTabAll")}
            </TabsTrigger>

            <TabsTrigger value="unread" className="gap-1.5 px-3">
              {t("shared.notifUnreadLabel")}

              {unread > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo">
                  {formatNumber(unread)}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-sheet px-6 py-14">
            <EmptyState
              icon={CheckCheck}
              title={t("shared.notifAllCaughtUp")}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-3">
                <div className="flex items-center gap-3 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {GROUP_LABEL[group.key]}
                  </span>

                  <div className="h-px flex-1 bg-border/70" />

                  <span className="text-[11px] tabular-nums text-ink-3">
                    {formatNumber(group.items.length)}
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border/70 bg-sheet">
                  {group.items.map((n, index) => {
                    const meta = TYPE_META[n.type] ?? TYPE_META.default;
                    const Icon = meta.icon;

                    const typeKey = `shared.notifType_${n.type}`;
                    const typeLabel = t.has(asKey(typeKey))
                      ? t(asKey(typeKey))
                      : null;

                    const typeText =
                      typeLabel ?? n.type.replace(/\_/g, " ");

                    const isLast = index === group.items.length - 1;

                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={cn(
                          "group relative flex w-full items-start gap-4 px-4 py-4 text-start transition-colors",
                          "hover:bg-accent/45",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/30 focus-visible:ring-inset",
                          !isLast && "border-b border-border/60",
                          !n.read && "bg-indigo-soft/20",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-0 start-0 w-0.5 transition-opacity",
                            n.read ? "opacity-0" : "bg-indigo opacity-100",
                          )}
                        />

                        <span
                          className={cn(
                            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
                            TONE_CIRCLE[meta.tone],
                          )}
                        >
                          <Icon
                            className="size-[18px]"
                            aria-hidden="true"
                          />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                            <span
                              className={cn(
                                "min-w-0 text-sm leading-5",
                                n.read
                                  ? "font-medium text-ink-2"
                                  : "font-semibold text-ink",
                              )}
                            >
                              {n.title}
                            </span>

                            <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
                              {timeAgo(n.createdAt, t, formatNumber)}
                            </span>
                          </span>

                          <span
                            className={cn(
                              "mt-1 block max-w-[760px] text-[13px] leading-5",
                              n.read ? "text-ink-3" : "text-ink-2",
                              "line-clamp-2",
                            )}
                          >
                            {n.body}
                          </span>

                          <span className="mt-2.5 flex items-center gap-2">
                            <StatusBadge tone={meta.tone}>
                              {typeText}
                            </StatusBadge>

                            {!n.read && (
                              <span className="size-1.5 rounded-full bg-indigo" />
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
