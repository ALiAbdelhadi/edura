import { platformDb } from "@/lib/db/scope";
import { shiftDayKey, toDateKey, todayKey } from "@repo/server-core/lib/date-key";
import { dayRange } from "@repo/server-core/lib/day-range";
import { studentAndParents } from "@repo/server-core/services/notifications/fanout";
import { generateAndEmailInvoice } from "@/lib/services/finance/invoices";
import { notify } from "@/lib/services/notifications/notify";
import { send as sendNotification } from "@repo/notifications";
import { getNetProfitReport } from "@repo/server-core/services/reports/reports";
import { buildGapReport } from "@repo/server-core/services/external-teachers/gaps";

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

export async function runLessonReminders(now: Date) {
  const soon = new Date(now.getTime() + 30 * 60_000);
  const hhmm = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const from = hhmm(new Date(now.getTime() + 25 * 60_000));
  const to = hhmm(new Date(now.getTime() + 35 * 60_000));
  const dayStart = new Date(
    Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate()),
  );
  const dayEnd = new Date(
    Date.UTC(
      soon.getUTCFullYear(),
      soon.getUTCMonth(),
      soon.getUTCDate(),
      23,
      59,
      59,
    ),
  );

  const sessions = await platformDb((tx) =>
    tx.session.findMany({
      where: {
        status: "scheduled",
        date: { gte: dayStart, lte: dayEnd },
        startTime: { gte: from, lte: to },
      },
      select: { id: true, courseId: true, startTime: true },
      take: 500,
    }),
  );

  let notified = 0;
  for (const s of sessions) {
    const enrollments = await platformDb((tx) =>
      tx.enrollment.findMany({
        where: { courseId: s.courseId, status: "active" },
        select: { studentId: true },
      }),
    );
    const recipients = enrollments.map((e) => e.studentId);
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
  return { sessions: sessions.length, recipientsNotified: notified };
}

// =============================================================================
// WEEKLY CENTER DIGEST
//
// The one email a center owner receives unprompted. It answers three questions
// they would otherwise have to log in to ask: what came in last week, did the
// lessons actually run, and is anything left unfinished.
//
// EVERY FIGURE COMES FROM THE SERVICE THE DASHBOARD USES. `getNetProfitReport`
// returns revenue, expenses, net AND the attendance rate in one call, so the
// digest cannot disagree with the screen the owner opens after reading it. The
// job computes nothing of its own beyond counting the week's sessions.
//
// IDEMPOTENT WITHOUT A MIGRATION. A double-fired schedule must cost a no-op,
// not a second email. There is no `notification_type` value for a digest and
// adding one is a schema change that needs its own approved plan, so the marker
// is an append-only `audit_logs` row keyed on the center and the week. That is
// not a workaround dressed up: mailing a center's finances to an address IS a
// disclosure, and a permanent record of when it happened belongs in the audit
// trail whether or not it is also used to deduplicate.
//
// PER-CENTER ISOLATION. One center's failure — a missing owner, a report that
// throws — must not stop the other 300 from being told. Each center runs in its
// own try/catch and the run reports how many were skipped.
// =============================================================================

/**
 * The week that just ENDED: Sunday..Saturday, matching the Egyptian working
 * week the calendar screen already lays out. Never the week in progress — a
 * summary of a week still running is a number that changes after you read it.
 */
function lastWeekRange(now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  // getUTCDay(): 0 = Sunday. Step back to the most recent Sunday, then take the
  // seven days before it — the week the owner is reading about is one that has
  // finished, never the one they are living in.
  end.setUTCDate(end.getUTCDate() - end.getUTCDay() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

const DIGEST_ACTION = "center.weekly_digest_sent";

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

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const center of centers) {
    if (alreadySent.has(center.id)) {
      skipped++;
      continue;
    }
    try {
      const owner = center.ownerUserId
        ? await platformDb((tx) =>
            tx.user.findUnique({
              where: { id: center.ownerUserId as string },
              select: { id: true, email: true, locale: true, status: true },
            }),
          )
        : null;
      // No owner, no address, or a closed account: nothing to send to. Counted
      // as skipped, never as a failure — it is a state, not a fault.
      if (!owner?.email || owner.status !== "active") {
        skipped++;
        continue;
      }

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
      // The completeness report is a nice-to-have inside a digest: a center
      // with no off-system teachers has none, and a failure here must not cost
      // the owner their revenue figures.
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

      // THREE OUTCOMES, NOT TWO. `send` never throws — it reports — and the
      // notifications package draws a line this job must not erase: `skipped`
      // is a DELIBERATE non-send (console mail in dev, a preview run, a
      // channel switched off), `failed` is a fault. Collapsing them made every
      // dev run report failures for centers whose digest was correctly not
      // sent. Only a real send is marked, so a skipped week is retried once
      // mail is actually configured rather than being recorded as delivered.
      const delivered = result.results.some((r) => r.status === "sent");
      if (!delivered) {
        if (result.results.some((r) => r.status === "failed")) failed++;
        else skipped++;
        continue;
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
      sent++;
    } catch {
      failed++;
    }
  }

  return { job: "weekly-center-digest", periodStart, periodEnd, sent, skipped, failed };
}

/**
 * B.1#12 — renewal reminders. Monthly coverage is manual-renewal by design
 * (decision #2, no auto-charge), and until this job the only pre-expiry signal
 * was an in-app alert that fires while the reader is already inside the app.
 * This sweep runs on the `[status, periodEnd]` index — created for exactly
 * this in Step 4 — and tells the student AND their linked parents at
 * T-5 / T-2 / T-0 Cairo days before the window closes.
 *
 * IDEMPOTENT PER (subscription, bucket): each send carries `subscriptionId` +
 * `daysLeft` in its data, and the sweep skips a pair that already has its
 * notification row — so a double-fired schedule (or an hourly tick, if this
 * job is ever moved off the daily one) costs a no-op, never a duplicate.
 * Days are CAIRO days via `todayKey`/`shiftDayKey` — the same clock the money
 * screens bound days with; a UTC day here would remind Egyptian families a day
 * early or late for three hours around midnight.
 */
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

    for (const sub of subs) {
      const already = await platformDb((tx) =>
        tx.notification.findFirst({
          where: {
            type: "subscription_expiring",
            AND: [
              { data: { path: ["subscriptionId"], equals: sub.id } },
              { data: { path: ["daysLeft"], equals: daysLeft } },
            ],
          },
          select: { id: true },
        }),
      );
      if (already) {
        skipped++;
        continue;
      }

      const course = await platformDb((tx) =>
        tx.course.findUnique({ where: { id: sub.courseId }, select: { title: true } }),
      );
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
