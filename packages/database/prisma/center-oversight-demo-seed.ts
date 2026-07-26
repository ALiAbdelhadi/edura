/* eslint-disable no-console */
/**
 * ============================================================================
 * CENTER-OVERSIGHT DEMO SEED — is_demo data so every oversight tab is populated
 * ============================================================================
 * Builds TWO complete centers so the superadmin center picker has something to
 * switch between and the per-center scoping is visible by inspection:
 *
 *   مركز الأفق التعليمي  (OVSDEMOHRZN)          مركز النيل الحديث (OVSDEMONILE)
 *     admin   : هالة                              admin   : مصطفى
 *     staff   : reception / manager / accountant   staff   : reception
 *     teachers: أ. شريف, أ. داليا                  teachers: أ. عادل
 *     rooms   : قاعة النور, قاعة الفجر             rooms   : قاعة السلام
 *     students: 6 on the roster                    students: 3
 *     courses : 2 (+ sessions, enrollments,        courses : 1
 *               subscriptions, attendance)
 *     pending : 1 collaboration request            pending : —
 *
 * The pending collaboration request exists so the approve/reject control op
 * can be exercised in the preview without touching real data.
 *
 * MONEY — read this before "fixing" the empty Finance tab:
 *   This seed writes ZERO rows to transactions, points_ledger, wallet_ledger,
 *   session_settlements, payments, payouts, invoices or expenses, and never
 *   touches any wallet_balance. That is the CLAUDE.md rule for a feature that
 *   is not itself a money feature — center oversight only READS money.
 *   Subscriptions are therefore seeded as `pending_payment`: coverage that was
 *   never paid for, which is the only honest state without a ledger entry.
 *   The Finance tab for these two demo centers is legitimately empty; open a
 *   center that has real settlement history to see it populated.
 *
 * SAFETY (same contract as the other demo seeds):
 *   • Every ROOT entity (User / Center / Course) is flagged isDemo = true.
 *   • The permanent Egyptian catalog is READ, never written.
 *   • Real staff accounts are never touched.
 *   • assertNotProduction guards both the seed and the purge.
 *
 * Idempotent: deterministic UUIDv5 ids, re-run safely.
 *
 *   Seed:  pnpm exec tsx --env-file=.env.local prisma/center-oversight-demo-seed.ts
 *   Purge: pnpm exec tsx --env-file=.env.local prisma/center-oversight-demo-seed.ts --purge
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

const did = seedId("edura-ovsdemo:");
const flc = (id: string) =>
  createHash("sha1").update("ovsflc:" + id).digest("hex").slice(0, 10).toUpperCase();

const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
const daysAhead = (d: number) => new Date(Date.now() + d * DAY);

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({ id: did(key), key, name, role });

// ---- centers -------------------------------------------------------------
const HORIZON_SHORT = "OVSDEMOHRZN";
const NILE_SHORT = "OVSDEMONILE";
const HORIZON = did("center:horizon");
const NILE = did("center:nile");

// ---- cast ----------------------------------------------------------------
const HALA = P("hala", "هالة عبد الرحمن", "center_admin");
const RECEPTION_A = P("reception-a", "نورا سامي", "center_staff");
const MANAGER_A = P("manager-a", "أحمد فتحي", "center_staff");
const ACCOUNTANT_A = P("accountant-a", "هبة زكي", "center_staff");
const SHERIF = P("sherif", "أ. شريف الجندي", "teacher");
const DALIA = P("dalia", "أ. داليا مرسي", "teacher");
const STUDENTS_A = [
  P("st-a1", "مالك حسام", "student"),
  P("st-a2", "جنى وائل", "student"),
  P("st-a3", "زياد طارق", "student"),
  P("st-a4", "ملك عصام", "student"),
  P("st-a5", "كريم أشرف", "student"),
  P("st-a6", "سلمى ياسر", "student"),
];

const MOSTAFA = P("mostafa", "مصطفى الحديدي", "center_admin");
const RECEPTION_B = P("reception-b", "دينا رأفت", "center_staff");
const ADEL = P("adel", "أ. عادل شكري", "teacher");
const STUDENTS_B = [
  P("st-b1", "يوسف نبيل", "student"),
  P("st-b2", "هنا مازن", "student"),
  P("st-b3", "عمرو صلاح", "student"),
];

// A teacher with no affiliation yet — the pending collaboration request.
const APPLICANT = P("applicant", "أ. منى الشاذلي", "teacher");

const ALL: Person[] = [
  HALA, RECEPTION_A, MANAGER_A, ACCOUNTANT_A, SHERIF, DALIA, ...STUDENTS_A,
  MOSTAFA, RECEPTION_B, ADEL, ...STUDENTS_B, APPLICANT,
];

const email = (p: Person) => `ovsdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const ROOM_NOUR = did("room:nour");
const ROOM_FAJR = did("room:fajr");
const ROOM_SALAM = did("room:salam");
const COURSE_MATH = did("course:math");
const COURSE_CHEM = did("course:chem");
const COURSE_BIO = did("course:bio");
const COLLAB_PENDING = did("collab:pending");

// ---------------------------------------------------------------------------

async function purge() {
  console.log("Purging center-oversight demo data…");
  await withPlatformContext(async (tx) => {
    // Resolve by NATURAL keys (email / shortId), never by the id formula — a
    // purge keyed on the formula silently misses whatever a previous formula
    // wrote (H-03).
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: {
        OR: [{ shortId: { in: [HORIZON_SHORT, NILE_SHORT] } }, { id: { in: [HORIZON, NILE] } }],
      },
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
    await tx.collaborationRequest.deleteMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
    });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.room.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.centerStudentRoster.deleteMany({ where: { studentId: { in: ids } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.blacklistCascadeAction.deleteMany({ where: { targetId: { in: ids } } });
    await tx.blacklistEntry.deleteMany({ where: { targetId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    // Audit rows created by exercising the control ops on the demo world.
    await tx.$executeRaw`
      DELETE FROM audit_logs WHERE center_id = ANY(${centerIds}::uuid[])`;
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
    });
  });
}

async function main() {
  await assertNotProduction("center-oversight-demo-seed");
  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding center-oversight demo…");

  await withPlatformContext(async (tx) => {
    // ---- catalog (READ ONLY) -------------------------------------------
    const grade = await tx.gradeLevel.findFirst({ orderBy: { sortOrder: "asc" } });
    const offering = grade
      ? await tx.subjectOffering.findFirst({
          where: { gradeLevelId: grade.id, isActive: true },
          select: { subjectId: true, trackId: true },
        })
      : null;
    if (!grade || !offering) {
      throw new Error(
        "The Egyptian education catalog is empty — run the main seed first (pnpm --filter @repo/database seed).",
      );
    }

    // ---- users ----------------------------------------------------------
    for (const p of ALL) {
      await tx.user.upsert({
        where: { id: p.id },
        update: { name: p.name, status: "active", isDemo: true, deletedAt: null },
        create: {
          id: p.id,
          name: p.name,
          role: p.role,
          email: email(p),
          passwordHash: hash,
          status: "active",
          locale: "ar",
          isDemo: true,
        },
      });
    }
    for (const t of [SHERIF, DALIA, ADEL, APPLICANT]) {
      await tx.teacherProfile.upsert({
        where: { userId: t.id },
        update: {},
        create: { userId: t.id, bio: `${t.name} — بيانات تجريبية`, subjects: [] },
      });
    }
    for (const s of [...STUDENTS_A, ...STUDENTS_B]) {
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: { fullName: s.name },
        create: {
          userId: s.id,
          fullName: s.name,
          familyLinkCode: flc(s.id),
          gradeLevelId: grade.id,
          onboardingCompleted: true,
        },
      });
    }
    console.log(`  ${ALL.length} users`);

    // ---- centers --------------------------------------------------------
    const mkCenter = async (
      id: string,
      shortId: string,
      name: string,
      owner: Person,
      extra: { area: string; governorate: string; classroomCount: number },
    ) => {
      await tx.center.upsert({
        where: { id },
        update: { name, status: "active", isDemo: true },
        create: {
          id,
          shortId,
          name,
          ownerUserId: owner.id,
          status: "active",
          isDemo: true,
          onboardingCompleted: true,
          email: email(owner),
          phone: "0100000000",
          whatsapp: "0100000000",
          address: `${extra.area}، ${extra.governorate}`,
          description: "مركز تجريبي لمعاينة شاشة الإشراف.",
          ...extra,
        },
      });
      await tx.centerAdminProfile.upsert({
        where: { userId: owner.id },
        update: { centerId: id },
        create: { userId: owner.id, centerId: id },
      });
    };

    await mkCenter(HORIZON, HORIZON_SHORT, "مركز الأفق التعليمي", HALA, {
      area: "مدينة نصر",
      governorate: "القاهرة",
      classroomCount: 2,
    });
    await mkCenter(NILE, NILE_SHORT, "مركز النيل الحديث", MOSTAFA, {
      area: "المعادي",
      governorate: "القاهرة",
      classroomCount: 1,
    });

    // ---- staff ----------------------------------------------------------
    const mkStaff = async (p: Person, centerId: string, role: "receptionist" | "manager" | "center_accountant", title: string) => {
      await tx.centerStaff.upsert({
        where: { id: did(`staff:${p.key}`) },
        update: { role, title, removedAt: null },
        create: { id: did(`staff:${p.key}`), centerId, staffUserId: p.id, role, title },
      });
    };
    await mkStaff(RECEPTION_A, HORIZON, "receptionist", "موظفة الاستقبال");
    await mkStaff(MANAGER_A, HORIZON, "manager", "مدير التشغيل");
    await mkStaff(ACCOUNTANT_A, HORIZON, "center_accountant", "محاسبة المركز");
    await mkStaff(RECEPTION_B, NILE, "receptionist", "موظفة الاستقبال");

    // ---- rooms ----------------------------------------------------------
    const mkRoom = async (id: string, centerId: string, name: string, capacity: number, price: number) => {
      await tx.room.upsert({
        where: { id },
        update: { name, capacity, price, isActive: true },
        create: { id, centerId, name, capacity, price, facilities: ["projector", "ac"], description: "قاعة تجريبية" },
      });
    };
    await mkRoom(ROOM_NOUR, HORIZON, "قاعة النور", 40, 30_000);
    await mkRoom(ROOM_FAJR, HORIZON, "قاعة الفجر", 25, 20_000);
    await mkRoom(ROOM_SALAM, NILE, "قاعة السلام", 30, 25_000);

    // ---- affiliations ---------------------------------------------------
    const mkAff = async (teacher: Person, centerId: string) => {
      await tx.centerTeacherAffiliation.upsert({
        where: { id: did(`aff:${teacher.key}`) },
        update: { status: "active", removedAt: null },
        create: {
          id: did(`aff:${teacher.key}`),
          centerId,
          teacherId: teacher.id,
          status: "active",
          centerShare: 0, // superadmin-owned; never proposed by either party
          respondedAt: daysAgo(60),
          expiresAt: daysAhead(300),
        },
      });
    };
    await mkAff(SHERIF, HORIZON);
    await mkAff(DALIA, HORIZON);
    await mkAff(ADEL, NILE);

    // ---- roster ---------------------------------------------------------
    const mkRoster = async (student: Person, centerId: string) => {
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId, studentId: student.id } },
        update: { leftAt: null, blacklisted: false },
        create: { centerId, studentId: student.id, addedAt: daysAgo(45) },
      });
    };
    for (const s of STUDENTS_A) await mkRoster(s, HORIZON);
    for (const s of STUDENTS_B) await mkRoster(s, NILE);

    // ---- courses + sessions + enrollments -------------------------------
    const mkCourse = async (
      id: string,
      centerId: string,
      teacher: Person,
      roomId: string,
      title: string,
      days: number[],
    ) => {
      await tx.course.upsert({
        where: { id },
        update: { title, status: "active", isDemo: true },
        create: {
          id,
          centerId,
          teacherId: teacher.id,
          defaultRoomId: roomId,
          title,
          subject: title,
          subjectId: offering.subjectId,
          gradeLevelId: grade.id,
          daysOfWeek: days,
          startTime: "16:00",
          endTime: "18:00",
          startDate: daysAgo(30),
          endDate: daysAhead(60),
          price: 0,
          pricePerMonth: 60_000, // piasters — plan price, NOT a ledger entry
          pricePerSession: 20_000,
          maxStudents: 30,
          status: "active",
          isDemo: true,
        },
      });
      return id;
    };

    await mkCourse(COURSE_MATH, HORIZON, SHERIF, ROOM_NOUR, "الرياضيات — مراجعة", [0, 3]);
    await mkCourse(COURSE_CHEM, HORIZON, DALIA, ROOM_FAJR, "الكيمياء — تأسيس", [1, 4]);
    await mkCourse(COURSE_BIO, NILE, ADEL, ROOM_SALAM, "الأحياء — مراجعة", [2, 5]);

    const mkSessions = async (courseId: string, teacher: Person, roomId: string) => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = did(`session:${courseId}:${i}`);
        const date = i < 4 ? daysAgo(28 - i * 7) : daysAhead((i - 3) * 7);
        await tx.session.upsert({
          where: { id },
          update: {},
          create: {
            id,
            courseId,
            teacherId: teacher.id,
            roomId,
            originalDate: date,
            date,
            startTime: "16:00",
            endTime: "18:00",
            // Past sessions read as completed, but NOTHING was distributed:
            // distributedAt stays NULL so no settlement is implied.
            status: i < 4 ? "completed" : "scheduled",
          },
        });
        ids.push(id);
      }
      return ids;
    };
    const mathSessions = await mkSessions(COURSE_MATH, SHERIF, ROOM_NOUR);
    const chemSessions = await mkSessions(COURSE_CHEM, DALIA, ROOM_FAJR);
    await mkSessions(COURSE_BIO, ADEL, ROOM_SALAM);

    const mkEnrollment = async (student: Person, courseId: string, centerId: string) => {
      const id = did(`enr:${student.key}:${courseId}`);
      await tx.enrollment.upsert({
        where: { id },
        update: { status: "active", unenrolledAt: null },
        create: {
          id,
          studentId: student.id,
          courseId,
          centerId,
          status: "active",
          enrolledAt: daysAgo(30),
          enrolledBy: student.id,
        },
      });
      return id;
    };

    for (const s of STUDENTS_A.slice(0, 5)) await mkEnrollment(s, COURSE_MATH, HORIZON);
    for (const s of STUDENTS_A.slice(2)) await mkEnrollment(s, COURSE_CHEM, HORIZON);
    for (const s of STUDENTS_B) await mkEnrollment(s, COURSE_BIO, NILE);

    // ---- subscriptions --------------------------------------------------
    // pending_payment ONLY. An `active` subscription asserts money arrived, and
    // this seed writes no Payment and no Transaction — see the money note in
    // the header. Coverage awaiting payment is the honest, ledger-free state.
    for (const [i, s] of STUDENTS_A.slice(0, 5).entries()) {
      const id = did(`sub:${s.key}`);
      // DB CHECK subs_plan_session: per_session MUST name its covered session,
      // monthly MUST NOT. Both plan shapes are seeded so the tab shows both.
      const monthly = i % 2 === 0;
      await tx.subscription.upsert({
        where: { id },
        update: { status: "pending_payment" },
        create: {
          id,
          studentId: s.id,
          targetType: "center",
          teacherId: SHERIF.id,
          centerId: HORIZON,
          courseId: COURSE_MATH,
          sessionId: monthly ? null : mathSessions[4],
          subjectId: offering.subjectId,
          gradeLevelId: grade.id,
          plan: monthly ? "monthly" : "per_session",
          price: monthly ? 60_000 : 20_000,
          status: "pending_payment",
          source: monthly ? "online" : "walk_in",
          isDemo: true,
        },
      });
    }

    // ---- attendance -----------------------------------------------------
    const statuses = ["present", "present", "late", "absent", "counter_only"] as const;
    for (const [si, s] of STUDENTS_A.slice(0, 5).entries()) {
      for (const [ci, sessionId] of mathSessions.slice(0, 4).entries()) {
        await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId, studentId: s.id } },
          update: {},
          create: {
            sessionId,
            studentId: s.id,
            courseId: COURSE_MATH,
            centerId: HORIZON,
            status: statuses[(si + ci) % statuses.length],
            markedBy: RECEPTION_A.id,
            counterAt: daysAgo(28 - ci * 7),
            counterBy: RECEPTION_A.id,
          },
        });
      }
    }
    for (const s of STUDENTS_A.slice(2, 5)) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: chemSessions[0], studentId: s.id } },
        update: {},
        create: {
          sessionId: chemSessions[0],
          studentId: s.id,
          courseId: COURSE_CHEM,
          centerId: HORIZON,
          status: "present",
          markedBy: RECEPTION_A.id,
        },
      });
    }

    // ---- one PENDING collaboration request (the approve/reject control op)
    await tx.collaborationRequest.upsert({
      where: { id: COLLAB_PENDING },
      update: { status: "pending", expiresAt: daysAhead(20) },
      create: {
        id: COLLAB_PENDING,
        initiator: "teacher",
        teacherId: APPLICANT.id,
        centerId: HORIZON,
        subjectId: offering.subjectId,
        gradeLevelId: grade.id,
        trackId: offering.trackId,
        roomId: ROOM_FAJR,
        daysOfWeek: [2, 5],
        startTime: "18:30",
        endTime: "20:00",
        startDate: daysAhead(7),
        expectedStudents: 18,
        // Neither party proposes a money number — superadmin config only.
        proposedCenterShare: 0,
        proposedPricingMethod: "whole_room_percent",
        message: "أرغب في تدريس مجموعة مسائية بالمركز.",
        status: "pending",
        expiresAt: daysAhead(20),
        createdBy: APPLICANT.id,
      },
    });

    console.log("  2 centers, 3 rooms, 4 staff, 4 teachers, 9 students, 3 courses");
    console.log("  1 pending collaboration request (for the approve/reject action)");
    console.log("  0 rows written to any money / ledger / wallet table");
  });

  console.log(`\nDemo logins (password: ${PASSWORD})`);
  console.log(`  center_admin  ${email(HALA)}      — ${HALA.name} (مركز الأفق)`);
  console.log(`  center_admin  ${email(MOSTAFA)}   — ${MOSTAFA.name} (مركز النيل)`);
  console.log(`  teacher       ${email(SHERIF)}    — ${SHERIF.name}`);
  console.log(`  student       ${email(STUDENTS_A[0])} — ${STUDENTS_A[0].name}`);
  console.log(
    `\nOpen the back office → Centers → "مركز الأفق التعليمي" → Oversight.\n` +
      `Finance is legitimately empty for demo centers (no money rows are seeded);\n` +
      `open a center with real settlement history to see that tab populated.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
