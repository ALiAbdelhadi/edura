/* eslint-disable no-console */
import { assertNotProduction } from "../scripts/db-guard";
import {
  assertHttpTargetSharesDatabase,
  requireErpBaseUrl,
} from "./http-target-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

let _baseUrl: string | null = null;
const baseUrl = () => (_baseUrl ??= requireErpBaseUrl("showcase-live-demo-seed"));
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-showcaselive:");
const CENTER_SHORT_ID = "SHOWCASE01";
const OWNER_EMAIL = "showcasedemo-marwan@edura.test";
const DOOR_TEACHER_EMAIL = "showcasedemo-hossam@edura.test";

const LIVE_SESSION = did("session:live");
const COLLAB_REQUEST = did("collab:pending");
const EXPENSE_TAG = "[showcase-live demo]";

const CAIRO = "Africa/Cairo";

function cairoClock(offsetMinutes: number): string {
  const t = new Date(Date.now() + offsetMinutes * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(t);
}

function cairoToday(): Date {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO }).format(new Date());
  return new Date(`${key}T00:00:00.000Z`);
}

async function assertSameDatabase(cookie: string): Promise<void> {
  const owner = await withPlatformContext((tx) =>
    tx.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } }),
  );
  if (!owner) {
    throw new Error(`showcase-live-demo-seed: ${OWNER_EMAIL} not found — run seed:showcase-demo first`);
  }
  await assertHttpTargetSharesDatabase({
    seedName: "showcase-live-demo-seed",
    baseUrl: baseUrl(),
    userId: owner.id,
    cookie,
  });
}

async function ownerCookie(): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status}) — dev server up on ${baseUrl()}?`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("sign-in returned no session cookie");
  await assertSameDatabase(cookie);
  return cookie;
}

async function purge() {
  await withPlatformContext(async (tx) => {
    await tx.attendanceRecord.deleteMany({ where: { sessionId: LIVE_SESSION } });
    await tx.session.deleteMany({ where: { id: LIVE_SESSION } });
    await tx.collaborationRequest.deleteMany({ where: { id: COLLAB_REQUEST } });
    const n = await tx.expense.deleteMany({ where: { description: { contains: EXPENSE_TAG } } });
    console.log(`purged: live session, collaboration request, ${n.count} expenses`);
  });
}

async function main() {
  await assertNotProduction("showcase-live-demo-seed");
  if (PURGE) return purge();

  const ctx = await withPlatformContext(async (tx) => {
    const center = await tx.center.findFirst({
      where: { shortId: CENTER_SHORT_ID },
      select: { id: true, name: true },
    });
    if (!center) throw new Error(`center ${CENTER_SHORT_ID} not found — run seed:showcase-demo`);

    const teacher = await tx.user.findFirst({
      where: { email: DOOR_TEACHER_EMAIL },
      select: { id: true, name: true },
    });
    if (!teacher) throw new Error(`${DOOR_TEACHER_EMAIL} not found — run seed:showcase-demo`);

    const course = await tx.course.findFirst({
      where: { centerId: center.id, teacherId: teacher.id },
      select: { id: true, title: true, defaultRoomId: true },
    });
    if (!course) throw new Error("the door teacher has no course at this center");

    return { center, teacher, course };
  });

  console.log(`Center:  ${ctx.center.name} (${CENTER_SHORT_ID})`);
  console.log(`Teacher: ${ctx.teacher.name} — ${ctx.course.title}\n`);

  const startTime = cairoClock(-35);
  const endTime = cairoClock(+55);
  const date = cairoToday();

  await withPlatformContext(async (tx) => {
    await tx.session.upsert({
      where: { id: LIVE_SESSION },
      create: {
        id: LIVE_SESSION,
        courseId: ctx.course.id,
        teacherId: ctx.teacher.id,
        roomId: ctx.course.defaultRoomId,
        originalDate: date,
        date,
        startTime,
        endTime,
        status: "scheduled",
      },
      update: { date, startTime, endTime, status: "scheduled" },
    });
    console.log(`lesson running now: ${startTime}–${endTime} Cairo, today`);

    const enrolled = await tx.enrollment.findMany({
      where: { courseId: ctx.course.id },
      select: { studentId: true },
      take: 8,
    });

    const reception = await tx.user.findFirst({
      where: { email: "showcasedemo-laila@edura.test" },
      select: { id: true },
    });
    const counterBy = reception?.id ?? ctx.teacher.id;

    let passed = 0;
    for (const e of enrolled.slice(0, 5)) {
      const existing = await tx.attendanceRecord.findFirst({
        where: { sessionId: LIVE_SESSION, studentId: e.studentId },
        select: { id: true },
      });
      const counterState = {
        status: "counter_only" as const,
        counterAt: new Date(Date.now() - 20 * 60_000),
        counterBy,
        doorAt: null,
        doorBy: null,
      };
      if (existing) {
        await tx.attendanceRecord.update({ where: { id: existing.id }, data: counterState });
      } else {
        await tx.attendanceRecord.create({
          data: {
            sessionId: LIVE_SESSION,
            courseId: ctx.course.id,
            centerId: ctx.center.id,
            studentId: e.studentId,
            markedBy: counterBy,
            ...counterState,
          },
        });
      }
      passed++;
    }
    console.log(`counter-passed students awaiting the door: ${passed}`);
  });

  await withPlatformContext(async (tx) => {
    const existing = await tx.collaborationRequest.findUnique({
      where: { id: COLLAB_REQUEST },
      select: { id: true },
    });
    if (existing) {
      console.log("collaboration request: already present");
      return;
    }

    const suitor = await tx.center.findFirst({
      where: { shortId: "COUNTERDEMO1" },
      select: { id: true, name: true },
    });
    const suitorAdmin = suitor
      ? await tx.centerAdminProfile.findFirst({
          where: { centerId: suitor.id },
          select: { userId: true },
        })
      : null;
    const subject = await tx.subject.findFirst({
      where: { code: "math" },
      select: { id: true, nameAr: true },
    });
    const grade = await tx.gradeLevel.findFirst({
      where: { code: "general-secondary-3" },
      select: { id: true, nameAr: true },
    });
    const room = suitor
      ? await tx.room.findFirst({ where: { centerId: suitor.id }, select: { id: true, name: true } })
      : null;

    if (!suitor || !suitorAdmin || !subject || !grade) {
      console.log(
        `collaboration request SKIPPED — missing ${[!suitor && "center COUNTERDEMO1 (run seed:counter-demo)", !suitorAdmin && "its owner", !subject && "subject 'math'", !grade && "grade 'general-secondary-3'"].filter(Boolean).join(", ")}`,
      );
      return;
    }

    await tx.collaborationRequest.create({
      data: {
        id: COLLAB_REQUEST,
        initiator: "center",
        teacherId: ctx.teacher.id,
        centerId: suitor.id,
        subjectId: subject.id,
        gradeLevelId: grade.id,
        roomId: room?.id ?? null,
        daysOfWeek: [0, 3],
        startTime: "17:00",
        endTime: "19:00",
        startDate: new Date(),
        expectedStudents: 22,
        proposedCenterShare: 2500, // 25.00 ج.م per student per lesson
        message: "عندنا مجموعة جاهزة ٢٢ طالب للثانوية العامة، والقاعة متاحة الأحد والأربعاء.",
        status: "pending",
        expiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
        createdBy: suitorAdmin.userId,
      },
    });
    console.log(
      `collaboration request: ${suitor.name} → ${ctx.teacher.name}, ${subject.nameAr} / ${grade.nameAr}${room ? ` / ${room.name}` : ""}, share 25.00 ج.م`,
    );
  });

  const already = await withPlatformContext((tx) =>
    tx.expense.count({ where: { description: { contains: EXPENSE_TAG } } }),
  );
  if (already > 0) {
    console.log(`expenses: ${already} already recorded`);
  } else {
    const cookie = await ownerCookie();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO }).format(new Date());
    const rows = [
      { amount: 450_000, category: "rent", description: `إيجار المقر — شهري ${EXPENSE_TAG}` },
      { amount: 78_500, category: "utilities", description: `كهرباء ومياه ${EXPENSE_TAG}` },
      { amount: 260_000, category: "salaries", description: `مرتبات الإداريين ${EXPENSE_TAG}` },
      { amount: 32_000, category: "supplies", description: `طباعة مذكرات وأدوات ${EXPENSE_TAG}` },
      { amount: 55_000, category: "marketing", description: `إعلانات محلية ${EXPENSE_TAG}` },
    ];
    let n = 0;
    for (const r of rows) {
      const res = await fetch(`${baseUrl()}/api/v1/expenses`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ...r, expenseDate: today }),
      });
      if (res.ok) n++;
      else console.log(`  expense failed (${res.status}): ${r.category}`);
    }
    const total = rows.reduce((a, r) => a + r.amount, 0);
    console.log(`expenses: ${n} recorded, ${(total / 100).toFixed(2)} ج.م total`);
  }

  await withPlatformContext(async (tx) => {
    const students = await tx.user.findMany({
      where: { email: { startsWith: "showcasedemo-student-" }, phone: null },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    });
    let n = 0;
    for (const s of students) {
      const seq = String(1000 + n).slice(-4);
      await tx.user.update({ where: { id: s.id }, data: { phone: `0100000${seq}` } });
      n++;
    }
    console.log(`phones set on ${n} showcase student(s) so the ID card issues`);
  });

  console.log("\nDone. Re-run before any capture — the lesson times are computed from the clock.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
