import { platformDb } from "../../db/scope";
import {
  PLATFORM_TIME_ZONE,
  shiftDayKey,
  toDateKey,
  todayKey,
} from "../../lib/date-key";
import { dayRange } from "../../lib/day-range";
import { studentAndParents } from "../notifications/fanout";
import { generateAndEmailInvoice } from "../finance/invoices";
import { notify } from "../notifications/notify";
import { send as sendNotification } from "@repo/notifications";
import { getNetProfitReport } from "../reports/reports";
import { buildGapReport } from "../external-teachers/gaps";

function lastMonthRange(now: Date): { start: Date; end: Date; label: string } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59),
  );
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label };
}

export async function runMonthEndStatements(now: Date) {
  const { start, end, label } = lastMonthRange(now);
  const periodStart = toDateKey(start);
  const periodEnd = toDateKey(end);

  const { teachers, centers, done } = await platformDb(async (tx) => {
    const teachers = await tx.teacherProfile.findMany({
      select: { userId: true },
      take: 5000,
    });
    const centers = await tx.center.findMany({
      where: { status: "active" },
      select: { id: true },
      take: 5000,
    });
    const existing = await tx.invoice.findMany({
      where: {
        type: { in: ["teacher_statement", "center_statement"] },
        periodStart: start,
      },
      select: { type: true, issuedToId: true, centerId: true },
    });
    const done = new Set(
      existing.map((e) => `${e.type}:${e.issuedToId ?? e.centerId}`),
    );
    return { teachers, centers, done };
  });

  let teacherCount = 0;
  let centerCount = 0;
  for (const t of teachers) {
    if (done.has(`teacher_statement:${t.userId}`)) continue;
    try {
      await generateAndEmailInvoice({
        type: "teacher_statement",
        issuedToId: t.userId,
        periodStart,
        periodEnd,
      });
      teacherCount++;
    } catch { }
  }
  for (const c of centers) {
    if (done.has(`center_statement:${c.id}`)) continue;
    try {
      await generateAndEmailInvoice({
        type: "center_statement",
        centerId: c.id,
        periodStart,
        periodEnd,
      });
      centerCount++;
    } catch { }
  }
  return {
    period: label,
    teacherStatements: teacherCount,
    centerStatements: centerCount,
  };
}

const REMINDER_LEAD_MS = 120 * 60_000;
const PLATFORM_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLATFORM_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

export async function runLessonReminders(now: Date) {
  const until = new Date(now.getTime() + REMINDER_LEAD_MS);
  const fromKey = todayKey(now);
  const toKey = todayKey(until);
  const from = PLATFORM_CLOCK.format(now);
  const to = PLATFORM_CLOCK.format(until);
  const onDay = (key: string) => ({
    gte: new Date(`${key}T00:00:00Z`),
    lt: new Date(`${shiftDayKey(key, 1)}T00:00:00Z`),
  });
  const windows =
    fromKey === toKey
      ? [{ date: onDay(fromKey), startTime: { gt: from, lte: to } }]
      : [
          { date: onDay(fromKey), startTime: { gt: from } },
          { date: onDay(toKey), startTime: { lte: to } },
        ];

  const { sessions: candidates, remindedIds } = await platformDb(async (tx) => {
    const sessions = await tx.session.findMany({
      where: { status: "scheduled", OR: windows },
      select: { id: true, courseId: true, startTime: true },
      take: 500,
    });
    const reminded =
      sessions.length === 0
        ? []
        : await tx.notification.findMany({
            where: {
              type: "lesson_reminder",
              OR: sessions.map((s) => ({
                data: { path: ["sessionId"], equals: s.id },
              })),
            },
            select: { data: true },
          });
    return {
      sessions,
      remindedIds: new Set(
        reminded.map((n) => (n.data as { sessionId?: unknown } | null)?.sessionId),
      ),
    };
  });
  const sessions = candidates.filter((s) => !remindedIds.has(s.id));

  const courseIds = [...new Set(sessions.map((s) => s.courseId))];
  const enrollments =
    courseIds.length === 0
      ? []
      : await platformDb((tx) =>
          tx.enrollment.findMany({
            where: { courseId: { in: courseIds }, status: "active" },
            select: { studentId: true, courseId: true },
          }),
        );
  const studentsByCourse = new Map<string, string[]>();
  for (const e of enrollments) {
    const list = studentsByCourse.get(e.courseId);
    if (list) list.push(e.studentId);
    else studentsByCourse.set(e.courseId, [e.studentId]);
  }

  let notified = 0;
  for (const s of sessions) {
    const recipients = studentsByCourse.get(s.courseId) ?? [];
    if (recipients.length === 0) continue;
    await notify({
      recipients,
      type: "lesson_reminder",
      title: "Lesson reminder",
      body: `Your lesson starts at ${s.startTime}.`,
      data: { sessionId: s.id, startTime: s.startTime },
    });
    notified += recipients.length;
  }
  return {
    sessions: sessions.length,
    skipped: candidates.length - sessions.length,
    recipientsNotified: notified,
  };
}

function lastWeekRange(now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() - end.getUTCDay() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

const DIGEST_ACTION = "center.weekly_digest_sent";
const DIGEST_CONCURRENCY = 4;

export async function runWeeklyCenterDigest(now: Date) {
  const { start, end } = lastWeekRange(now);
  const periodStart = toDateKey(start);
  const periodEnd = toDateKey(end);

  const { centers, alreadySent } = await platformDb(async (tx) => {
    const centers = await tx.center.findMany({
      where: { status: "active" },
      select: { id: true, name: true, ownerUserId: true },
      take: 5000,
    });
    const sent = await tx.auditLog.findMany({
      where: { action: DIGEST_ACTION, createdAt: { gte: start } },
      select: { centerId: true, afterState: true },
    });
    const alreadySent = new Set(
      sent
        .filter((r) => (r.afterState as { periodStart?: string } | null)?.periodStart === periodStart)
        .map((r) => r.centerId),
    );
    return { centers, alreadySent };
  });

  const digestOne = async (
    center: (typeof centers)[number],
  ): Promise<"sent" | "skipped" | "failed"> => {
    if (alreadySent.has(center.id)) return "skipped";
    try {
      const owner = center.ownerUserId
        ? await platformDb((tx) =>
            tx.user.findUnique({
              where: { id: center.ownerUserId as string },
              select: { id: true, email: true, locale: true, status: true },
            }),
          )
        : null;
      if (!owner?.email || owner.status !== "active") return "skipped";

      const acting = {
        id: owner.id,
        role: "center_admin" as const,
        centerId: center.id,
        locale: (owner.locale === "en" ? "en" : "ar") as "ar" | "en",
      };

      const report = await getNetProfitReport(acting, periodStart, periodEnd);
      const sessionsCount = await platformDb((tx) =>
        tx.session.count({
          where: {
            date: { gte: start, lte: end },
            course: { centerId: center.id },
          },
        }),
      );
      let gapsCount = 0;
      try {
        const gaps = await buildGapReport(acting, { from: start, to: end });
        gapsCount = gaps.blocking;
      } catch {
        gapsCount = 0;
      }

      const result = await sendNotification(
        "weekly_digest",
        { email: owner.email, locale: acting.locale, userId: owner.id, centerId: center.id },
        {
          centerName: center.name,
          periodStart,
          periodEnd,
          revenuePiasters: report.revenue,
          expensesPiasters: report.expenses,
          netPiasters: report.netProfit,
          attendanceRatePct: report.attendanceRate,
          sessionsCount,
          gapsCount,
          link: process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/${acting.locale}/dashboard/admin/reports`
            : null,
        },
      );

      const delivered = result.results.some((r) => r.status === "sent");
      if (!delivered) {
        return result.results.some((r) => r.status === "failed") ? "failed" : "skipped";
      }

      await platformDb((tx) =>
        tx.auditLog.create({
          data: {
            action: DIGEST_ACTION,
            targetType: "center",
            targetId: center.id,
            centerId: center.id,
            afterState: { periodStart, periodEnd, to: owner.email },
          },
        }),
      );
      return "sent";
    } catch {
      return "failed";
    }
  };

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < centers.length; i += DIGEST_CONCURRENCY) {
    const outcomes = await Promise.all(
      centers.slice(i, i + DIGEST_CONCURRENCY).map(digestOne),
    );
    for (const o of outcomes) {
      if (o === "sent") sent++;
      else if (o === "skipped") skipped++;
      else failed++;
    }
  }

  return { job: "weekly-center-digest", periodStart, periodEnd, sent, skipped, failed };
}

export async function runSubscriptionRenewalReminders(now: Date) {
  const buckets = [5, 2, 0];
  let notified = 0;
  let skipped = 0;

  for (const daysLeft of buckets) {
    const key = shiftDayKey(todayKey(now), daysLeft);
    const window = dayRange(key, key);
    if (!window?.gte || !window.lte) continue;

    const subs = await platformDb((tx) =>
      tx.subscription.findMany({
        where: {
          plan: "monthly",
          status: "active",
          periodEnd: { gte: window.gte, lte: window.lte },
        },
        select: { id: true, studentId: true, courseId: true, periodEnd: true },
        take: 1000,
      }),
    );

    if (subs.length === 0) continue;

    const { remindedIds, titles } = await platformDb(async (tx) => {
      const reminded = await tx.notification.findMany({
        where: {
          type: "subscription_expiring",
          data: { path: ["daysLeft"], equals: daysLeft },
          OR: subs.map((sub) => ({
            data: { path: ["subscriptionId"], equals: sub.id },
          })),
        },
        select: { data: true },
      });
      const courses = await tx.course.findMany({
        where: { id: { in: [...new Set(subs.map((sub) => sub.courseId))] } },
        select: { id: true, title: true },
      });
      return {
        remindedIds: new Set(
          reminded.map(
            (n) => (n.data as { subscriptionId?: unknown } | null)?.subscriptionId,
          ),
        ),
        titles: new Map(courses.map((c) => [c.id, c.title])),
      };
    });

    for (const sub of subs) {
      if (remindedIds.has(sub.id)) {
        skipped++;
        continue;
      }

      const course = titles.has(sub.courseId)
        ? { title: titles.get(sub.courseId) }
        : null;
      await notify({
        recipients: await studentAndParents(sub.studentId),
        type: "subscription_expiring",
        title:
          daysLeft === 0 ? "Subscription ends today" : `Subscription ends in ${daysLeft} days`,
        body: course?.title
          ? `The monthly subscription for ${course.title} ends ${daysLeft === 0 ? "today" : `in ${daysLeft} days`}. Renew to keep attending.`
          : "A monthly subscription is about to end. Renew to keep attending.",
        data: {
          subscriptionId: sub.id,
          courseId: sub.courseId,
          studentId: sub.studentId,
          daysLeft,
          periodEnd: sub.periodEnd?.toISOString() ?? null,
        },
      });
      notified++;
    }
  }

  return { job: "subscription-renewal-reminders", notified, skipped };
}
