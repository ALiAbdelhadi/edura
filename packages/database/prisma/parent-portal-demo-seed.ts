/* eslint-disable no-console */
/**
 * ============================================================================
 * PARENT PORTAL DEMO SEED — is_demo data so every parent screen has content
 * ============================================================================
 * Attaches children to the QUICK-LOGIN parent (mona.hassan@email.eg) so the
 * existing «ولي أمر» button on the login page lands on populated screens
 * rather than a wall of empty states.
 *
 * Two children ON PURPOSE, because the oversight screen has two states and
 * both need to be visible:
 *
 *   Lina Hassan   — MINOR (no date of birth ⇒ default-minor), approved link.
 *                   Has adult conversations, so oversight is ACTIVE and the
 *                   thread reader has something in it.
 *   Nour Hassan   — VERIFIED ADULT (18+, dateOfBirthVerifiedAt set). Oversight
 *                   is refused for her, so the screen shows the "nothing to
 *                   click, and a line saying why" state. That state is the
 *                   portal's whole thesis; a demo without it hides the point.
 *
 * The existing Mona→Lina link is `revoked` in dev (a past test run left it
 * that way, which is why the dashboard showed "no children"). This re-approves
 * it rather than minting a duplicate.
 *
 * SAFETY (same contract as messaging-demo-seed.ts / preview-seed.ts):
 *   • Every ROOT entity (User / Course / Conversation) is flagged isDemo = true.
 *   • ZERO writes to any money / ledger / wallet table: no transactions,
 *     payments, payouts, invoices, expenses, points_ledger, subscriptions.
 *     wallet_balance / points_balance stay at their 0 default.
 *     >>> The parent FEES screen therefore stays legitimately empty. Seeding
 *         it would mean writing the money ledger, which needs its own approved
 *         plan per CLAUDE.md. <<<
 *   • The permanent Egyptian catalog is READ, never written.
 *   • Real staff accounts are never touched.
 *
 * Idempotent: deterministic UUIDv5 ids, re-run safely.
 *
 *   Seed:  bunx tsx --env-file=<env> prisma/parent-portal-demo-seed.ts
 *   Purge: bunx tsx --env-file=<env> prisma/parent-portal-demo-seed.ts --purge
 * ============================================================================
 */
import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const NS = "parent-portal-demo";
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;

const PARENT_EMAIL = "mona.hassan@email.eg";
const LINA_EMAIL = "lina.hassan@student.nile-academy.eg";
const NOUR_EMAIL = "nour.hassan@student.nile-academy.eg";

// seedId is curried: seedId(prefix) returns the deterministic UUIDv5 generator.
const id = seedId(`${NS}:`);

/** Four weeks of plausible attendance: mostly present, a little late, rare absence. */
function attendancePattern(i: number): "present" | "late" | "absent" {
  if (i % 11 === 0) return "absent";
  if (i % 5 === 0) return "late";
  return "present";
}

async function phase1() {
  return withPlatformContext(async (tx) => {
    const parent = await tx.user.findFirst({ where: { email: PARENT_EMAIL } });
    if (!parent) throw new Error(`quick-login parent ${PARENT_EMAIL} not found`);

    const lina = await tx.user.findFirst({ where: { email: LINA_EMAIL } });
    if (!lina) throw new Error(`quick-login student ${LINA_EMAIL} not found`);

    // ── PURGE ──────────────────────────────────────────────────────────────
    if (PURGE) {
      const nour = await tx.user.findFirst({ where: { email: NOUR_EMAIL } });
      const kids = [lina.id, ...(nour ? [nour.id] : [])];

      await tx.conversationMessage.deleteMany({
        where: { conversation: { OR: kids.map((k) => ({ userAId: k })) } },
      });
      await tx.conversation.deleteMany({
        where: { isDemo: true, OR: kids.map((k) => ({ userAId: k })) },
      });
      await tx.attendanceRecord.deleteMany({ where: { studentId: { in: kids } } });
      await tx.gradeScore.deleteMany({ where: { studentId: { in: kids } } });
      await tx.session.deleteMany({ where: { id: { in: [...Array(24)].map((_, i) => id(`session:${i}`)) } } });
      await tx.grade.deleteMany({ where: { id: { in: [...Array(12)].map((_, i) => id(`grade:${i}`)) } } });
      if (nour) {
        await tx.enrollment.deleteMany({ where: { studentId: nour.id } });
        await tx.parentStudentLink.deleteMany({ where: { studentId: nour.id } });
        await tx.studentProfile.deleteMany({ where: { userId: nour.id } });
        await tx.user.delete({ where: { id: nour.id } });
      }
      // Leave Lina, her link and her enrolments alone — they predate this seed.
      console.log("purged parent-portal demo data");
      return;
    }

    // ── The second child: a VERIFIED ADULT ─────────────────────────────────
    const nourId = id("user:nour");
    const eighteenYearsAgo = new Date(Date.now() - 19 * 365 * DAY);
    await tx.user.upsert({
      where: { id: nourId },
      create: {
        id: nourId,
        email: NOUR_EMAIL,
        name: "نور حسن",
        role: "student",
        status: "active",
        isDemo: true,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
      },
      update: { name: "نور حسن", status: "active", isDemo: true },
    });
    await tx.studentProfile.upsert({
      where: { userId: nourId },
      create: {
        userId: nourId,
        fullName: "نور حسن",
        familyLinkCode: `DEMO-NOUR-${nourId.slice(0, 6).toUpperCase()}`,
        dateOfBirth: eighteenYearsAgo,
        // The ONLY route out of default-minor: a VERIFIED date of birth.
        dateOfBirthVerifiedAt: new Date(),
      },
      update: {
        dateOfBirth: eighteenYearsAgo,
        dateOfBirthVerifiedAt: new Date(),
      },
    });

    // ── Links: re-approve Lina's, create Nour's ────────────────────────────
    const linaLink = await tx.parentStudentLink.findFirst({
      where: { parentId: parent.id, studentId: lina.id },
    });
    if (linaLink) {
      await tx.parentStudentLink.update({
        where: { id: linaLink.id },
        data: { status: "approved" },
      });
    } else {
      await tx.parentStudentLink.create({
        data: {
          id: id("link:lina"),
          parentId: parent.id,
          studentId: lina.id,
          status: "approved",
          initiatedBy: "parent",
        },
      });
    }
    await tx.parentStudentLink.upsert({
      where: { id: id("link:nour") },
      create: {
        id: id("link:nour"),
        parentId: parent.id,
        studentId: nourId,
        status: "approved",
        initiatedBy: "parent",
      },
      update: { status: "approved" },
    });

    return { parent, lina, nourId };
  });
}

async function phase2(parent: { id: string }, linaId: string, nourId: string) {
  return withPlatformContext(async (tx) => {
    // ── Courses to hang grades and attendance off ──────────────────────────
    const courses = await tx.course.findMany({
      where: { isDemo: true, centerId: { not: null } },
      select: { id: true, title: true, centerId: true, teacherId: true },
      take: 3,
    });
    if (courses.length === 0) throw new Error("no demo courses with a center found");

    for (const c of courses) {
      for (const studentId of [linaId, nourId]) {
        const key = `enr:${c.id}:${studentId}`;
        await tx.enrollment.upsert({
          where: { id: id(key) },
          create: {
            id: id(key),
            studentId,
            courseId: c.id,
            centerId: c.centerId,
            status: "active",
            enrolledBy: parent.id,
          },
          update: { status: "active" },
        });
      }
    }

    return courses;
  });
}

async function phase3(
  courses: Array<{ id: string; title: string; centerId: string | null; teacherId: string }>,
  linaId: string,
  nourId: string,
) {
  return withPlatformContext(async (tx) => {
    // ── Grades: several per course so the subject breakdown has shape ──────
    let g = 0;
    for (const c of courses) {
      for (let n = 0; n < 3; n++) {
        const gradeId = id(`grade:${g}`);
        const maxScore = 100;
        await tx.grade.upsert({
          where: { id: gradeId },
          create: {
            id: gradeId,
            courseId: c.id,
            centerId: c.centerId!,
            teacherId: c.teacherId,
            name: `اختبار ${n + 1} — ${c.title}`,
            maxScore,
            date: new Date(Date.now() - (20 - g * 2) * DAY),
          },
          update: {},
        });
        // Distinct profiles per child so the two look like different students.
        for (const [studentId, base] of [
          [linaId, 88],
          [nourId, 74],
        ] as const) {
          const score = Math.min(maxScore, base + ((g * 7 + n * 5) % 12) - 4);
          const scoreId = id(`score:${g}:${studentId}`);
          await tx.gradeScore.upsert({
            where: { id: scoreId },
            create: { id: scoreId, gradeId, studentId, score },
            update: { score },
          });
        }
        g++;
      }
    }

    return g;
  });
}

/**
 * Sessions + attendance, in BATCHES.
 *
 * 24 sessions x (1 session + 2 attendance rows) is ~72 sequential round-trips,
 * and against Neon that blows the 20s interactive-transaction ceiling. Batching
 * keeps each transaction short; the seed is idempotent, so a partial run is
 * simply re-runnable rather than corrupting anything.
 */
async function phase4(
  courses: Array<{ id: string; title: string; centerId: string | null; teacherId: string }>,
  linaId: string,
  nourId: string,
  from: number,
  to: number,
) {
  return withPlatformContext(async (tx) => {
    const course = courses[0]!;
    for (let i = from; i < to; i++) {
      const sessionId = id(`session:${i}`);
      const date = new Date(Date.now() - (24 - i) * DAY);
      await tx.session.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          courseId: course.id,
          teacherId: course.teacherId,
          originalDate: date,
          date,
          startTime: "16:00",
          endTime: "18:00",
          status: "completed",
        },
        update: { date, status: "completed" },
      });

      for (const [studentId, offset] of [
        [linaId, 0],
        [nourId, 3],
      ] as const) {
        const recId = id(`att:${i}:${studentId}`);
        await tx.attendanceRecord.upsert({
          where: { id: recId },
          create: {
            id: recId,
            sessionId,
            studentId,
            courseId: course.id,
            centerId: course.centerId,
            status: attendancePattern(i + offset),
            markedBy: course.teacherId,
          },
          update: { status: attendancePattern(i + offset) },
        });
      }
    }

  });
}

async function phase5(
  courses: Array<{ id: string; title: string; centerId: string | null; teacherId: string }>,
  linaId: string,
) {
  const course = courses[0]!;
  return withPlatformContext(async (tx) => {
    // ── An adult conversation, so oversight has a thread to read ───────────
    const teacher = await tx.user.findUnique({
      where: { id: course.teacherId },
      select: { id: true, name: true },
    });
    if (teacher) {
      const convId = id("conv:lina-teacher");
      const lines: Array<[string, string]> = [
        [teacher.id, "مساء الخير يا لينا، مذاكرة الفصل الثالث مهمة لامتحان الأسبوع الجاي."],
        [linaId, "تمام يا أستاذ، هل المراجعة هتكون في الحصة الجاية؟"],
        [teacher.id, "أيوه، هنراجع المسائل كلها وهرفع ملف تلخيص قبلها."],
        [linaId, "شكراً جزيلاً."],
      ];
      const last = lines[lines.length - 1]!;
      // `conversations_pair_canonical` CHECKs user_a_id < user_b_id, so the
      // pair is canonicalized before insert exactly as the app code does.
      // Which slot a participant lands in carries no meaning — the oversight
      // reader keys off senderId, not on A/B.
      const [userAId, userBId] =
        linaId < teacher.id ? [linaId, teacher.id] : [teacher.id, linaId];
      await tx.conversation.upsert({
        where: { id: convId },
        create: {
          id: convId,
          userAId,
          userBId,
          centerId: course.centerId,
          isDemo: true,
          lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          lastMessagePreview: last[1],
          lastMessageSenderId: last[0],
        },
        update: { isDemo: true },
      });
      for (let i = 0; i < lines.length; i++) {
        const [senderId, body] = lines[i]!;
        const msgId = id(`msg:${i}`);
        await tx.conversationMessage.upsert({
          where: { id: msgId },
          create: {
            id: msgId,
            conversationId: convId,
            senderId,
            body,
            status: "read",
            createdAt: new Date(Date.now() - (lines.length - i) * 60 * 60 * 1000),
          },
          update: { body },
        });
      }
    }

    console.log("seeded parent portal demo data");
  });
}

async function main() {
  // MUST be awaited: the guard is async, so calling it bare left the
  // production check unenforced — the script would have carried on before the
  // environment label was ever read.
  await assertNotProduction("parent-portal-demo-seed");
  const first = await phase1();
  if (!first) return; // purge path
  const { parent, lina, nourId } = first;
  const courses = await phase2(parent, lina.id, nourId);
  const grades = await phase3(courses, lina.id, nourId);
  for (let i = 0; i < 24; i += 4) {
    await phase4(courses, lina.id, nourId, i, Math.min(i + 4, 24));
  }
  await phase5(courses, lina.id);

  console.log("");
  console.log(`  parent   : ${PARENT_EMAIL} (password ${PASSWORD})`);
  console.log(`  children : لينا حسن (MINOR — oversight active)`);
  console.log(`             نور حسن (VERIFIED ADULT — oversight refused)`);
  console.log(`  courses  : ${courses.length}, grades: ${grades}, sessions: 24`);
  console.log("  fees     : deliberately EMPTY — money tables are not seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
