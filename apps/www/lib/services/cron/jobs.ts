import { platformDb } from "@/lib/db/scope";
import { generateAndEmailInvoice } from "@/lib/services/finance/invoices";
import { notify } from "@/lib/services/notifications/notify";

/**
 * Scheduled jobs (PRD §5.5 month-end statements, §6 lesson reminders). Invoked by
 * a secured cron endpoint (Vercel Cron / any scheduler) — see
 * app/api/v1/cron/[job]/route.ts. Idempotent where it matters: statement
 * generation skips a (beneficiary, period) that already has a statement.
 */

function lastMonthRange(now: Date): { start: Date; end: Date; label: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label };
}

/** Month-end teacher + center statements for the previous month. */
export async function runMonthEndStatements(now: Date) {
  const { start, end, label } = lastMonthRange(now);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);

  const { teachers, centers, done } = await platformDb(async (tx) => {
    const teachers = await tx.teacherProfile.findMany({ select: { userId: true }, take: 5000 });
    const centers = await tx.center.findMany({ where: { status: "active" }, select: { id: true }, take: 5000 });
    // Already-generated statements for this period → idempotent re-runs.
    const existing = await tx.invoice.findMany({
      where: { type: { in: ["teacher_statement", "center_statement"] }, periodStart: start },
      select: { type: true, issuedToId: true, centerId: true },
    });
    const done = new Set(existing.map((e) => `${e.type}:${e.issuedToId ?? e.centerId}`));
    return { teachers, centers, done };
  });

  let teacherCount = 0;
  let centerCount = 0;
  for (const t of teachers) {
    if (done.has(`teacher_statement:${t.userId}`)) continue;
    try {
      await generateAndEmailInvoice({ type: "teacher_statement", issuedToId: t.userId, periodStart, periodEnd });
      teacherCount++;
    } catch { /* skip a single failed statement, continue the batch */ }
  }
  for (const c of centers) {
    if (done.has(`center_statement:${c.id}`)) continue;
    try {
      await generateAndEmailInvoice({ type: "center_statement", centerId: c.id, periodStart, periodEnd });
      centerCount++;
    } catch { /* continue */ }
  }
  return { period: label, teacherStatements: teacherCount, centerStatements: centerCount };
}

/** Lesson reminders for sessions starting in ~30 minutes (PRD §6 row 13). */
export async function runLessonReminders(now: Date) {
  // Window: sessions dated today whose start time is 25–35 min from now.
  const soon = new Date(now.getTime() + 30 * 60_000);
  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const from = hhmm(new Date(now.getTime() + 25 * 60_000));
  const to = hhmm(new Date(now.getTime() + 35 * 60_000));
  const dayStart = new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate()));
  const dayEnd = new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate(), 23, 59, 59));

  const sessions = await platformDb((tx) =>
    tx.session.findMany({
      where: { status: "scheduled", date: { gte: dayStart, lte: dayEnd }, startTime: { gte: from, lte: to } },
      select: { id: true, courseId: true, startTime: true },
      take: 500,
    }),
  );

  let notified = 0;
  for (const s of sessions) {
    const enrollments = await platformDb((tx) =>
      tx.enrollment.findMany({ where: { courseId: s.courseId, status: "active" }, select: { studentId: true } }),
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
