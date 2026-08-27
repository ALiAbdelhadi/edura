import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import {
  registerChannel,
  type ChannelResult,
  type NotificationChannel,
  type Recipient,
  type TemplateData,
  type TemplateId,
} from "@repo/notifications";
import { toDateKey } from "@repo/server-core/lib/date-key";
import { getNetProfitReport } from "@repo/server-core/services/reports/reports";
import { runWeeklyCenterDigest } from "@/lib/services/cron/jobs";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "wdig-" + Math.floor(Math.random() * 1e9).toString(36);
const DIGEST_ACTION = "center.weekly_digest_sent";

function lastWeekRange(now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() - end.getUTCDay() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

const NOW = new Date();
const WEEK = lastWeekRange(NOW);
const PERIOD_START = toDateKey(WEEK.start);
const PERIOD_END = toDateKey(WEEK.end);
const midWeek = () => new Date(WEEK.start.getTime() + 3 * 24 * 60 * 60 * 1000);
const EARLIER_NOW = new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000);

type Call = { centerId: string | undefined; data: TemplateData<"weekly_digest">; to: Recipient };
const calls: Call[] = [];
const behaviour = new Map<string, "sent" | "skipped" | "failed">();

const stubChannel: NotificationChannel = {
  id: "whatsapp",
  isEnabled: () => true,
  supports: (t: TemplateId) => t === "weekly_digest",
  async send<T extends TemplateId>(
    template: T,
    to: Recipient,
    data: TemplateData<T>,
  ): Promise<ChannelResult> {
    const verdict = behaviour.get(to.centerId ?? "") ?? "skipped";
    if (behaviour.has(to.centerId ?? "")) {
      calls.push({ centerId: to.centerId, data: data as TemplateData<"weekly_digest">, to });
    }
    if (verdict === "failed") return { channel: "whatsapp", status: "failed", error: "stub refused" };
    if (verdict === "sent") return { channel: "whatsapp", status: "sent", messageId: `stub-${calls.length}` };
    return { channel: "whatsapp", status: "skipped" };
  },
};

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

async function digestRows(centerId: string) {
  return q<{ id: string; after_state: { periodStart?: string; periodEnd?: string; to?: string } }>(
    `SELECT id, after_state FROM audit_logs WHERE action = $1 AND center_id = $2 ORDER BY created_at`,
    [DIGEST_ACTION, centerId],
  );
}

const callsFor = (centerId: string) => calls.filter((c) => c.centerId === centerId);

async function main() {
  console.log("Weekly center digest —", tag);
  console.log(`  window: ${PERIOD_START} → ${PERIOD_END}`);

  const fx = await withPlatformContext(async (tx) => {
    let n = 0;
    const mkCenter = async (
      key: string,
      owner: { status?: "active" | "suspended"; email?: string | null } | null,
    ) => {
      const short = `${tag}${n++}`.slice(0, 12).toUpperCase();
      const ownerUser = owner
        ? await tx.user.create({
            data: {
              name: `${tag}-owner-${key}`, role: "center_admin",
              ...(owner.email === null ? {} : { email: owner.email ?? `${tag}-${key}@x.io` }),
              status: owner.status ?? "active", isDemo: true,
            },
          })
        : null;
      const center = await tx.center.create({
        data: {
          name: `${tag}-${key}`, shortId: short,
          status: "active", walletBalance: 0, isDemo: true,
          ...(ownerUser ? { ownerUserId: ownerUser.id } : {}),
        },
      });
      return { center: center.id, owner: ownerUser?.id ?? null };
    };

    const live = await mkCenter("live", {});            // the ordinary case
    const quiet = await mkCenter("quiet", {});          // stub reports skipped
    const broken = await mkCenter("broken", {});        // stub reports failed
    const suspended = await mkCenter("susp", { status: "suspended" });
    const noEmail = await mkCenter("noml", { email: null });
    const ownerless = await mkCenter("none", null);

    const teacher = await tx.user.create({
      data: { name: tag + "-teacher", role: "teacher", email: tag + "-t@x.io", status: "active", isDemo: true },
    });
    const student = await tx.user.create({
      data: { name: tag + "-طالب", role: "student", email: tag + "-s@x.io", status: "active", isDemo: true },
    });
    const course = await tx.course.create({
      data: {
        centerId: live.center, teacherId: teacher.id, title: tag + "-مجموعة",
        subject: "math", daysOfWeek: [1], startTime: "16:00", endTime: "18:00",
        startDate: WEEK.start, price: 100_00, maxStudents: 10, status: "active", isDemo: true,
      },
    });
    const session = await tx.session.create({
      data: {
        courseId: course.id, teacherId: teacher.id,
        originalDate: midWeek(), date: midWeek(),
        startTime: "16:00", endTime: "18:00", status: "completed",
      },
    });
    await tx.attendanceRecord.create({
      data: {
        sessionId: session.id, studentId: student.id, courseId: course.id,
        centerId: live.center, status: "present", markedBy: live.owner!,
      },
    });
    await tx.payment.create({
      data: {
        centerId: live.center, studentId: student.id, courseId: course.id,
        amount: 450_00, status: "paid", receiptNumber: `${tag}-R1`,
        recordedBy: live.owner!, paidAt: midWeek(),
      },
    });
    await tx.expense.create({
      data: {
        centerId: live.center, amount: 175_00, category: "utilities",
        description: tag + "-power", recordedBy: live.owner!, expenseDate: midWeek(),
      },
    });

    return {
      live, quiet, broken, suspended, noEmail, ownerless,
      teacher: teacher.id, student: student.id, course: course.id, session: session.id,
    };
  });

  const centerIds = [fx.live, fx.quiet, fx.broken, fx.suspended, fx.noEmail, fx.ownerless].map((c) => c.center);
  const userIds = [fx.live, fx.quiet, fx.broken, fx.suspended, fx.noEmail, fx.ownerless]
    .map((c) => c.owner)
    .filter((id): id is string => !!id)
    .concat([fx.teacher, fx.student]);

  behaviour.set(fx.live.center, "sent");
  behaviour.set(fx.quiet.center, "skipped");
  behaviour.set(fx.broken.center, "failed");
  behaviour.set(fx.suspended.center, "sent");
  behaviour.set(fx.noEmail.center, "sent");
  behaviour.set(fx.ownerless.center, "sent");

  const unregister = registerChannel(stubChannel);

  try {
    console.log("\n[1] The week reported is one that has FINISHED");
    const run1 = await runWeeklyCenterDigest(NOW);
    ok(run1.periodStart === PERIOD_START && run1.periodEnd === PERIOD_END,
      `the job reports ${run1.periodStart} → ${run1.periodEnd}`);
    ok(WEEK.end.getTime() < NOW.getTime(), "the window ends before now — never the week the owner is living in");
    ok(WEEK.end.getUTCDay() === 6, "it ends on a Saturday…");
    ok(WEEK.start.getUTCDay() === 0, "…and starts on the Sunday seven days earlier");
    ok(
      (WEEK.end.getTime() - WEEK.start.getTime() + 1) / 86_400_000 === 7,
      "which is exactly seven calendar days, end inclusive",
    );

    console.log("\n[2] A real send — the figures are the reports screen's own");
    const liveCalls = callsFor(fx.live.center);
    ok(liveCalls.length === 1, `the live center's owner was written to exactly once (${liveCalls.length})`);
    const payload = liveCalls[0]!.data;
    const acting = {
      id: fx.live.owner!, role: "center_admin", centerId: fx.live.center, locale: "ar",
    } as SessionUser;
    const report = await getNetProfitReport(acting, PERIOD_START, PERIOD_END);
    ok(payload.revenuePiasters === report.revenue && report.revenue === 450_00,
      `revenue in the digest is the report's own 450.00 (got ${payload.revenuePiasters / 100})`);
    ok(payload.expensesPiasters === report.expenses && report.expenses === 175_00,
      `expenses too (got ${payload.expensesPiasters / 100})`);
    ok(payload.netPiasters === report.netProfit && report.netProfit === 275_00,
      `and the net is the subtraction, not a second derivation (got ${payload.netPiasters / 100})`);
    ok(payload.attendanceRatePct === report.attendanceRate,
      `the attendance rate is the report's (${payload.attendanceRatePct}%)`);
    ok(payload.sessionsCount === 1, `one lesson ran that week (got ${payload.sessionsCount})`);
    ok(payload.periodStart === PERIOD_START && payload.periodEnd === PERIOD_END,
      "the email states the period it is about");
    ok(payload.centerName === `${tag}-live`, "…and names the center it belongs to");
    ok(
      !JSON.stringify(payload).includes("token") && !(payload.link ?? "").includes("token"),
      "the link carries no token — it lands on the ordinary login-gated reports screen",
    );
    ok(liveCalls[0]!.to.email === `${tag}-live@x.io`, "it went to the owner's address on file");

    console.log("\n[3] IDEMPOTENCY — the second run does not mail the same week again");
    const after1 = await digestRows(fx.live.center);
    ok(after1.length === 1, "one audit row records the send");
    ok(after1[0]!.after_state.periodStart === PERIOD_START,
      "…keyed on the PERIOD, which is what makes it an idempotency key rather than a log line");
    ok(after1[0]!.after_state.to === `${tag}-live@x.io`, "and it records where it went");

    const run2 = await runWeeklyCenterDigest(NOW);
    ok(callsFor(fx.live.center).length === 1,
      "a second run of the same week writes to the owner ZERO further times");
    const after2 = await digestRows(fx.live.center);
    ok(after2.length === 1, "…and adds no second audit row");
    ok(after2[0]!.id === after1[0]!.id, "the original row is untouched — append-only, never rewritten");
    ok(run2.skipped >= 1, `the run reports the center as skipped, not sent (skipped=${run2.skipped})`);

    console.log("\n[4] A DIFFERENT week is not blocked by last week's row");
    const run3 = await runWeeklyCenterDigest(EARLIER_NOW);
    ok(run3.periodStart !== PERIOD_START, `an earlier run covers a different period (${run3.periodStart})`);
    const earlierCalls = callsFor(fx.live.center).filter((c) => c.data.periodStart === run3.periodStart);
    ok(earlierCalls.length === 1, "the owner is written to once for that period");
    const after3 = await digestRows(fx.live.center);
    ok(after3.length === 2, "a second audit row appears, for the second period");
    ok(
      new Set(after3.map((r) => r.after_state.periodStart)).size === 2,
      "the two rows name two different periods — the key is the period, not the center",
    );

    console.log("\n[5] `skipped` is not `failed`, and a non-send stays OWED");
    ok(callsFor(fx.quiet.center).length >= 1, "the quiet center's digest was attempted");
    ok((await digestRows(fx.quiet.center)).length === 0,
      "…and NO audit row was written, so the week is still owed once mail is configured");
    ok(callsFor(fx.broken.center).length >= 1, "the broken center's digest was attempted");
    ok((await digestRows(fx.broken.center)).length === 0,
      "…and a channel FAILURE likewise records nothing — a failure is not a delivery");
    ok(run1.failed >= 1, `a real failure is counted as failed (failed=${run1.failed})`);
    ok(run1.sent >= 1 && run1.skipped >= 1,
      `the three outcomes are reported separately (sent=${run1.sent}, skipped=${run1.skipped}, failed=${run1.failed})`);

    console.log("\n[6] Nobody to write to is a STATE, not a fault");
    ok(callsFor(fx.suspended.center).length === 0,
      "a suspended owner is never written to — the digest is not a way around a closed account");
    ok(callsFor(fx.noEmail.center).length === 0, "an owner with no address is not written to");
    ok(callsFor(fx.ownerless.center).length === 0, "a center with no owner at all is not written to");
    for (const [label, c] of [["suspended", fx.suspended], ["address-less", fx.noEmail], ["ownerless", fx.ownerless]] as const) {
      ok((await digestRows(c.center)).length === 0, `…and the ${label} center gets no audit row`);
    }

    console.log("\n[7] A digest is a READ of the books, never a write to them");
    const money = await q<{ n: number }>(
      `SELECT (SELECT count(*) FROM payments WHERE center_id = ANY($1::uuid[]))
            + (SELECT count(*) FROM expenses WHERE center_id = ANY($1::uuid[]))
            + (SELECT count(*) FROM transactions WHERE center_id = ANY($1::uuid[]))
            + (SELECT count(*) FROM session_settlements WHERE center_id = ANY($1::uuid[])) AS n`,
      [centerIds],
    );
    ok(Number(money[0]!.n) === 2, "after three runs the money tables still hold exactly the two fixture rows");
    const otherAudit = await q<{ n: number }>(
      `SELECT count(*)::int n FROM audit_logs WHERE center_id = ANY($1::uuid[]) AND action <> $2`,
      [centerIds, DIGEST_ACTION],
    );
    ok(otherAudit[0]!.n === 0, "and the only audit rows it wrote are its own idempotency records");
    const notifications = await q<{ n: number }>(
      `SELECT count(*)::int n FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds],
    );
    ok(notifications[0]!.n === 0, "no in-app notification row either — the digest is email, and says so");
  } finally {
    unregister();
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM attendance_records WHERE course_id = $1`, [fx.course]);
      await c.query(`DELETE FROM sessions WHERE id = $1`, [fx.session]);
      await c.query(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [centerIds]);
      await c.query(`DELETE FROM expenses WHERE center_id = ANY($1::uuid[])`, [centerIds]);
      await c.query(`DELETE FROM audit_logs WHERE center_id = ANY($1::uuid[])`, [centerIds]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`UPDATE centers SET owner_user_id = NULL WHERE id = ANY($1::uuid[])`, [centerIds]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centerIds]);
      const left = await c.query(`SELECT count(*)::int n FROM centers WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite weekly-digest.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
