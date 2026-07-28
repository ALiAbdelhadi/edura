/* eslint-disable no-console */
/**
 * ============================================================================
 * PARENT-PAY DEMO SEED — is_demo data so the parent pay + wallet screens are
 * populated, not empty
 * ============================================================================
 * Builds ONE family and one center around it:
 *
 *   ولي الأمر: أ. سامي عبد الرحمن   (parent, wallet pre-loaded with 750 EGP)
 *     ├── ابنه   : يوسف   (student, grade + track set, onboarding complete)
 *     └── ابنته  : ملك    (student, same, so the child selector has two pills)
 *
 *   مركز صدى العلم (PAYDEMOSADA)
 *     teacher : أ. منى فؤاد
 *     courses : 2, BOTH plans priced (monthly + per-session)
 *     sessions: 4 upcoming per course, so the "choose a lesson" picker is full
 *
 * WHAT IS DELIBERATELY *NOT* SEEDED, and why
 *   No paid subscription, no Payment, no Transaction, no points row. Those are
 *   append-only ledgers (IMMUTABLE_MODELS + DB REVOKEs) — seeding them would
 *   create demo rows that the purge below CANNOT remove, which is exactly the
 *   trap the is_demo contract exists to avoid. The preview is better without
 *   them anyway: open /dashboard/parent/pay and actually pay, by card (mock
 *   mode) or from the wallet, and watch the real engine run.
 *
 * THE ONE MONEY ROW IT DOES WRITE
 *   The parent's opening wallet balance: one parent_wallet_ledger row + the
 *   cached balance, through the SAME parentWalletCredit primitive the app uses.
 *   CLAUDE.md permits money rows for a feature that IS a money feature with an
 *   approved plan — this is that — and migration 20260727110100_parent_wallet
 *   deliberately left parent_wallet_ledger without a DB-level REVOKE precisely
 *   so is_demo preview rows stay purgeable. The purge removes it.
 *
 * SAFETY (same contract as the other demo seeds):
 *   • Every ROOT entity (User / Center / Course) is flagged isDemo = true.
 *   • The permanent Egyptian catalog is READ, never written.
 *   • Real staff accounts are never touched.
 *   • assertNotProduction guards both the seed and the purge.
 *
 * Idempotent: deterministic UUIDv5 ids, re-run safely.
 *
 *   Seed:  pnpm exec tsx --env-file=.env prisma/parent-pay-demo-seed.ts
 *   Purge: pnpm exec tsx --env-file=.env prisma/parent-pay-demo-seed.ts --purge
 * ============================================================================
 */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";
import type { Role } from "../src/generated/client/index";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;

const did = seedId("edura-paydemo:");
const flc = (id: string) =>
  createHash("sha1").update("payflc:" + id).digest("hex").slice(0, 10).toUpperCase();

const daysAhead = (d: number) => new Date(Date.now() + d * DAY);

type Person = { id: string; name: string; role: Role; slug: string };

const mk = (slug: string, name: string, role: Role): Person => ({
  id: did(`user:${slug}`),
  name,
  role,
  slug,
});

const SAMI = mk("sami", "أ. سامي عبد الرحمن", "parent");
const YOUSEF = mk("yousef", "يوسف سامي", "student");
const MALAK = mk("malak", "ملك سامي", "student");
const MONA = mk("mona", "أ. منى فؤاد", "teacher");
const HANY = mk("hany", "أ. هاني رشدي", "center_admin");

const ALL = [SAMI, YOUSEF, MALAK, MONA, HANY];
const email = (p: Person) => `paydemo.${p.slug}@edura.demo`;
const EMAILS = ALL.map(email);

const CENTER = did("center:sada");
const CENTER_SHORT = "PAYDEMOSADA";
const COURSE_A = did("course:algebra");
const COURSE_B = did("course:physics");

/** 750 EGP, in piasters — enough for several per-session passes below. */
const OPENING_BALANCE = 75000;

// ---------------------------------------------------------------------------

async function purge() {
  console.log("Purging parent-pay demo data…");
  await withPlatformContext(async (tx) => {
    // Resolve by NATURAL keys (email / shortId), never by the id formula — a
    // purge keyed on the formula silently misses whatever a previous formula
    // wrote (H-03).
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: { OR: [{ shortId: CENTER_SHORT }, { id: CENTER }] },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);
    const courses = await tx.course.findMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.subscription.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollmentRequest.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.centerStudentRoster.deleteMany({ where: { studentId: { in: ids } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.parentStudentLink.deleteMany({
      where: { OR: [{ parentId: { in: ids } }, { studentId: { in: ids } }] },
    });

    // The wallet subledger is append-only at RUNTIME (the Prisma immutability
    // extension refuses deleteMany on ParentWalletLedger) but was deliberately
    // left without a DB-level REVOKE so preview rows stay purgeable — see
    // migration 20260727110100_parent_wallet. Raw delete, narrowed to these
    // demo parents, on a non-production database.
    const ledgerRows =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`
            DELETE FROM parent_wallet_ledger WHERE parent_id = ANY(${ids}::uuid[])`;
    // Any payment intents the preview created by clicking through checkout.
    if (ids.length) {
      await tx.$executeRaw`
        DELETE FROM payment_intents
        WHERE payer_user_id = ANY(${ids}::uuid[]) OR student_id = ANY(${ids}::uuid[])`;
    }
    await tx.parentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
    // `user.deleteMany` is intercepted by the soft-delete extension (the row
    // and its UNIQUE email would survive and P2002 the next run). Raw hard
    // delete, narrowed to these ids AND is_demo, on a non-production DB.
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", {
      users: hardDeleted,
      centers: centerIds.length,
      courses: courseIds.length,
      parentWalletLedgerRows: ledgerRows,
    });
    console.log(
      "NOTE: any Payment / Transaction rows produced by clicking through a\n" +
        "      checkout in the preview are append-only and are NOT removed here.\n" +
        "      They are covered by the Step 9 pre-launch wipe.",
    );
  });
}

// ---------------------------------------------------------------------------

async function main() {
  await assertNotProduction("parent-pay-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  console.log("Seeding parent-pay demo data…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(async (tx) => {
    // ---- catalog (READ ONLY — permanent reference data) -------------------
    // The child's grade + track are what make the pay screen's default
    // "child's subjects" tab non-empty; without them it falls back to an
    // empty-state and the preview proves nothing.
    const grade = await tx.gradeLevel.findFirst({ orderBy: { sortOrder: "asc" } });
    const offering = grade
      ? await tx.subjectOffering.findFirst({
          where: { gradeLevelId: grade.id, isActive: true },
        })
      : null;
    if (!grade || !offering) {
      throw new Error(
        "parent-pay-demo-seed: the education catalog is empty — run `pnpm seed` first.",
      );
    }

    // ---- users -----------------------------------------------------------
    for (const p of ALL) {
      await tx.user.upsert({
        where: { id: p.id },
        update: { name: p.name, status: "active", isDemo: true },
        create: {
          id: p.id,
          name: p.name,
          email: email(p),
          role: p.role,
          status: "active",
          passwordHash,
          isDemo: true,
        },
      });
    }

    await tx.parentProfile.upsert({
      where: { userId: SAMI.id },
      update: {},
      // walletBalance is NOT set here: the balance is established below through
      // the real credit primitive, so the cache and the ledger agree and
      // reconcileParentWallet passes on demo data like it does on real data.
      create: { userId: SAMI.id },
    });

    for (const s of [YOUSEF, MALAK]) {
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: { fullName: s.name, gradeLevelId: grade.id, trackId: offering.trackId },
        create: {
          userId: s.id,
          fullName: s.name,
          familyLinkCode: flc(s.id),
          gradeLevelId: grade.id,
          trackId: offering.trackId,
          onboardingCompleted: true,
        },
      });
      // The APPROVED link is the gate every parent money path checks.
      const existing = await tx.parentStudentLink.findFirst({
        where: { parentId: SAMI.id, studentId: s.id },
      });
      if (existing) {
        await tx.parentStudentLink.update({
          where: { id: existing.id },
          data: { status: "approved", revokedBy: null },
        });
      } else {
        await tx.parentStudentLink.create({
          data: {
            parentId: SAMI.id,
            studentId: s.id,
            status: "approved",
            initiatedBy: "parent",
          },
        });
      }
    }

    await tx.teacherProfile.upsert({
      where: { userId: MONA.id },
      update: {},
      create: { userId: MONA.id, bio: `${MONA.name} — بيانات تجريبية`, subjects: [] },
    });

    // ---- center ----------------------------------------------------------
    await tx.center.upsert({
      where: { id: CENTER },
      update: { name: "مركز صدى العلم", status: "active", isDemo: true },
      create: {
        id: CENTER,
        shortId: CENTER_SHORT,
        name: "مركز صدى العلم",
        ownerUserId: HANY.id,
        area: "المعادي",
        governorate: "القاهرة",
        classroomCount: 4,
        status: "active",
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: HANY.id },
      update: { centerId: CENTER },
      create: { userId: HANY.id, centerId: CENTER },
    });

    for (const s of [YOUSEF, MALAK]) {
      const roster = await tx.centerStudentRoster.findFirst({
        where: { centerId: CENTER, studentId: s.id, leftAt: null },
      });
      if (!roster) {
        await tx.centerStudentRoster.create({
          data: { centerId: CENTER, studentId: s.id },
        });
      }
    }

    // ---- courses: BOTH plans priced, so both buttons appear ---------------
    const mkCourse = async (
      id: string,
      title: string,
      perMonth: number,
      perSession: number,
      days: number[],
      startTime: string,
      endTime: string,
    ) => {
      await tx.course.upsert({
        where: { id },
        update: { pricePerMonth: perMonth, pricePerSession: perSession, status: "active" },
        create: {
          id,
          centerId: CENTER,
          teacherId: MONA.id,
          title,
          subject: title,
          subjectId: offering.subjectId,
          gradeLevelId: grade.id,
          trackId: offering.trackId,
          daysOfWeek: days,
          startTime,
          endTime,
          startDate: daysAhead(1),
          price: perMonth,
          pricePerMonth: perMonth,
          pricePerSession: perSession,
          maxStudents: 25,
          status: "active",
          isDemo: true,
        },
      });
      // Four upcoming sessions so the "choose a lesson" picker is populated.
      for (let i = 0; i < 4; i++) {
        const when = daysAhead(3 + i * 7);
        const sid = did(`session:${id}:${i}`);
        await tx.session.upsert({
          where: { id: sid },
          update: { date: when, originalDate: when, status: "scheduled" },
          create: {
            id: sid,
            courseId: id,
            teacherId: MONA.id,
            date: when,
            originalDate: when,
            startTime,
            endTime,
            status: "scheduled",
          },
        });
      }
    };

    await mkCourse(COURSE_A, "الجبر والهندسة", 30000, 8000, [1, 3], "16:00", "17:30");
    await mkCourse(COURSE_B, "الفيزياء", 35000, 10000, [2, 4], "18:00", "19:30");

    // ---- the parent's opening wallet balance ------------------------------
    // Written the way parentWalletCredit writes it — cache update + ONE ledger
    // row carrying the running balanceAfter, in this transaction — so the demo
    // balance reconciles (cached == SUM(delta) == last balanceAfter) exactly
    // like real money does.
    //
    // Inlined rather than imported: @repo/database is the BOTTOM of the stack
    // and @repo/server-core (where the primitive lives) sits above it, so
    // importing it here would invert the dependency direction and break this
    // package's rootDir. Four lines of duplication is the cheaper price.
    //
    // Idempotent: only credited when the parent has no ledger history yet, so
    // re-running the seed does not keep topping the wallet up.
    const existingLedger = await tx.parentWalletLedger.count({
      where: { parentId: SAMI.id },
    });
    if (existingLedger === 0) {
      const updated = await tx.parentProfile.update({
        where: { userId: SAMI.id },
        data: { walletBalance: { increment: OPENING_BALANCE } },
        select: { walletBalance: true },
      });
      await tx.parentWalletLedger.create({
        data: {
          parentId: SAMI.id,
          type: "topup",
          delta: OPENING_BALANCE,
          balanceAfter: updated.walletBalance,
          method: "online_paymob",
          reason: "رصيد افتتاحي — بيانات تجريبية",
          recordedBy: SAMI.id,
        },
      });
    }

    console.log("  5 users (1 parent, 2 children, 1 teacher, 1 center admin)");
    console.log("  1 center, 2 courses (both plans priced), 8 upcoming sessions");
    console.log(`  parent wallet opening balance: ${OPENING_BALANCE / 100} EGP`);
    console.log("  0 paid subscriptions / payments / ledger transactions (pay them yourself)");
  });

  console.log(`\nDemo logins (password: ${PASSWORD})`);
  console.log(`  parent   ${email(SAMI)}   — ${SAMI.name}`);
  console.log(`  student  ${email(YOUSEF)} — ${YOUSEF.name}`);
  console.log(`  student  ${email(MALAK)}  — ${MALAK.name}`);
  console.log(
    `\nSign in as the parent → "ادفع لدرس" (/dashboard/parent/pay):\n` +
      `  pick a child, open a subject, choose a lesson, then pay by card\n` +
      `  (mock gateway) or straight from the wallet. Check the result on\n` +
      `  "محفظتي" (/dashboard/parent/wallet) and on the child's own screens.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
