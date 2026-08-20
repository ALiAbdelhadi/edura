"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { usePathname, useRouter } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustomMutation, useList } from "@refinedev/core";
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
  Users,
  UserX,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  NOTIFICATION_PORTALS,
  notificationPath,
  portalForRole,
  type NotificationPortal,
} from "@repo/server-core/services/notifications/deep-link";
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// One entry per `notifType_*` i18n key — a notification's tone AND icon both
// come from here, so the badge colour and the leading glyph never disagree.
// `default` is the fallback for any type that ships without a matching entry.
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

// Matches StatusBadge's own tone→colour map — the icon's soft circle has to
// use the same pair the badge beside it uses, or the two would disagree.
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
  // The portal segment comes from the ACTUAL path (/dashboard/<portal>/…):
  // these routes are fixed folders, so there is no `role` route param — the
  // old params-based read always fell back to "student" and mislinked every
  // deep link on the staff/assistant/admin portals.
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

  // ONE destination map, shared with web push (see deep-link.ts). The switch
  // that used to live here applied a single suffix to every portal, so a
  // parent's grade notification opened /dashboard/parent/grades and a teacher's
  // cancelled lesson opened /dashboard/teacher/schedule — neither route exists.
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

  const unread = notifications.filter((n) => !n.read).length;
  const visible = tab === "unread" ? notifications.filter((n) => !n.read) : notifications;

  // Today / Yesterday / Earlier, computed once per render off the already-
  // loaded (and already-filtered) list — the API returns newest-first, so a
  // single pass forward preserves that order inside each bucket. Runs
  // unconditionally (ABOVE the loading/empty early returns below) — a hook
  // cannot be called on some renders and skipped on others.
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
    <div className="flex w-full max-w-[1440px] flex-col gap-6">
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")}>
        <TabsList>
          <TabsTrigger value="all">{t("shared.notifTabAll")}</TabsTrigger>
          <TabsTrigger value="unread">
            {t("shared.notifUnreadLabel")}
            {unread > 0 && (
              <span className="ms-1 rounded-full bg-indigo-soft px-1.5 py-0.5 text-[10px] font-semibold text-indigo">
                {formatNumber(unread)}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <EmptyState icon={CheckCheck} title={t("shared.notifAllCaughtUp")} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-2.5">
              <span className="px-1 text-[12px] font-semibold text-ink-3">
                {GROUP_LABEL[group.key]}
              </span>
              {/* Bento: dense auto-flow, tone-driven span. An unread notification
                  that needs a decision (warning/danger tone) gets a wide, taller
                  tile so it reads as more important WITHOUT a fifth colour —
                  size is the second signal, after the icon/badge colour. A read
                  or routine notification stays a compact single cell. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 [grid-auto-flow:dense]">
                {group.items.map((n) => {
                  const meta = TYPE_META[n.type] ?? TYPE_META.default;
                  const Icon = meta.icon;
                  const typeKey = `shared.notifType_${n.type}`;
                  const typeLabel = t.has(asKey(typeKey)) ? t(asKey(typeKey)) : null;
                  const typeText = typeLabel ?? n.type.replace(/_/g, " ");
                  const featured =
                    !n.read && (meta.tone === "danger" || meta.tone === "warning");
                  return (
                    <Card
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        "cursor-pointer overflow-hidden border-s-2 py-0 transition-colors hover:bg-accent",
                        n.read ? "border-s-transparent" : "border-s-indigo bg-sheet",
                        featured && "sm:col-span-2",
                      )}
                    >
                      <CardContent
                        className={cn(
                          "flex h-full items-start gap-3 p-3.5",
                          featured && "sm:p-4",
                        )}
                      >
                        <span
                          className={cn(
                            "flex shrink-0 items-center justify-center rounded-full",
                            featured ? "mt-0.5 size-11" : "mt-0.5 size-9",
                            TONE_CIRCLE[meta.tone],
                          )}
                        >
                          <Icon className={featured ? "size-5" : "size-4"} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={cn(
                                featured ? "text-[15px]" : "text-sm",
                                n.read ? "font-normal text-ink-2" : "font-semibold text-ink",
                              )}
                            >
                              {n.title}
                            </span>
                            <span className="shrink-0 text-[11px] text-ink-3">
                              {timeAgo(n.createdAt, t, formatNumber)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "m-0 mt-0.5 text-[13px] text-ink-2",
                              featured ? "line-clamp-3" : "line-clamp-2",
                            )}
                          >
                            {n.body}
                          </p>
                          <div className="mt-2">
                            <StatusBadge tone={meta.tone}>{typeText}</StatusBadge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
