/* eslint-disable no-console */
/**
 * ============================================================================
 * SHOWCASE DEMO SEED — the center that appears in every marketing screenshot.
 * ============================================================================
 * Feeds `apps/showcase`'s Phase 2 asset pipeline: a single, coherent, populated
 * center that makes EVERY role's screens render with realistic content, in both
 * locales, so nothing on the marketing site is an empty state or a mockup.
 *
 * «سنتر النيل التعليمي» — six roles, three halls covering all three pricing
 * shapes, four courses, eight weeks of sessions (past AND upcoming), attendance
 * in every status the engine can produce, grades, materials, team notes and
 * parent links in every state.
 *
 * ── SAFETY (approved 2026-08-02, same contract as the other demo seeds) ──────
 *   • Every ROOT entity (User / Center / Course) is flagged isDemo = true;
 *     children inherit demo-ness by ancestry (decision #6).
 *   • ZERO writes to any money / ledger / wallet table — no Transaction, no
 *     Payment, no Invoice, no Payout, no WalletLedger, no ParentWalletLedger,
 *     no PointsLedger, no SessionSettlement. Those tables are append-only, so a
 *     row written here could never be purged again.
 *     Consequence, and it is deliberate: the finance screens are EMPTY for this
 *     center until a real payment flow is run by hand in the preview. Every
 *     money figure that reaches the marketing site therefore came out of the
 *     real settlement engine, which is the entire claim the site is making.
 *   • Sessions are left `scheduled`/`completed` with `distributedAt` NULL —
 *     completing one through the API is what writes money, and that is a
 *     preview action, not a seed action.
 *   • The permanent Egyptian catalog is READ, never written.
 *   • Real staff accounts are never touched.
 *   • dev/test only — `assertNotProduction` refuses production by label.
 *
 * Idempotent: deterministic UUIDv5 ids, re-run safely.
 *
 *   Seed:  bun run seed:showcase-demo
 *   Purge: bun run seed:showcase-demo --purge
 * ============================================================================
 */
import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext, type TenantTx } from "../src/index";
import { seedId } from "./seed-ids";
import type {
  AttendanceStatus,
  CenterStaffRole,
  Role,
  RoomPricingMethod,
} from "../src/generated/client/index";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const DAY = 24 * 60 * 60 * 1000;
const did = seedId("edura-showcasedemo:");

/** Piasters. Kept as whole EGP × 100 so every figure reads cleanly on screen. */
const EGP = (pounds: number) => Math.round(pounds * 100);

const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({
  id: did(`user:${key}`),
  key,
  name,
  role,
});

// ── The cast ────────────────────────────────────────────────────────────────
// Deliberately invented names. No real person, center or phone number appears
// in this file, and none may be added to it.

const OWNER = P("marwan", "مروان الشناوي", "center_admin");

const RECEPTION = P("laila", "ليلى رشدي", "center_staff");
const MANAGER = P("tarek", "طارق حجازي", "center_staff");
const ACCOUNTANT = P("salma", "سلمى بدير", "center_staff");

const T_PHYSICS = P("hossam", "أ. حسام الدين مرسي", "teacher");
const T_CHEM = P("mona", "أ. منى الجندي", "teacher");
const T_MATH = P("rafik", "أ. رفيق سليمان", "teacher");

const A_NOUR = P("nour", "نور عبد الله", "assistant");
const A_EYAD = P("eyad", "إياد مختار", "assistant");

const PARENTS = [
  P("soheir", "سهير قنديل", "parent"),
  P("emad", "عماد الطوخي", "parent"),
  P("hala", "هالة بركات", "parent"),
];

const STUDENT_NAMES = [
  "يوسف قنديل",
  "مريم الطوخي",
  "أدهم بركات",
  "جنى الشاذلي",
  "زياد المنشاوي",
  "ملك عبد الوهاب",
  "عمر الفقي",
  "لينا صادق",
  "كريم الدسوقي",
  "نادين شعراوي",
  "حازم العزب",
  "تالة مرزوق",
];
const STUDENTS = STUDENT_NAMES.map((name, i) => P(`student-${i + 1}`, name, "student"));

const STAFF: readonly [Person, CenterStaffRole, string][] = [
  [RECEPTION, "receptionist", "مكتب الاستقبال"],
  [MANAGER, "manager", "مدير السنتر"],
  [ACCOUNTANT, "center_accountant", "المحاسبة"],
];

const TEACHERS = [T_PHYSICS, T_CHEM, T_MATH];
const ALL: Person[] = [
  OWNER,
  ...STAFF.map(([p]) => p),
  ...TEACHERS,
  A_NOUR,
  A_EYAD,
  ...PARENTS,
  ...STUDENTS,
];

// Natural keys — stable across any id-formula change (the H-03 purge lesson:
// resolve fixtures by natural key, never by a derived id).
const email = (p: Person) => `showcasedemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);
const CENTER_SHORT_ID = "SHOWCASE01";
const CENTER = did("center:nile");

// ── Halls ───────────────────────────────────────────────────────────────────
// Three, chosen so the three pricing shapes are all visible on one screen:
// whole-room %, per-attending-student, and a hall that permits both.
const ROOMS: {
  key: string;
  name: string;
  capacity: number;
  price: number | null;
  methods: RoomPricingMethod[];
  description: string;
}[] = [
  {
    key: "nile",
    name: "قاعة النيل",
    capacity: 40,
    price: EGP(600),
    methods: ["whole_room_percent"],
    description: "القاعة الكبرى — سبورة ذكية وتكييف مركزي.",
  },
  {
    key: "amal",
    name: "قاعة الأمل",
    capacity: 24,
    price: null,
    methods: ["per_attending_student"],
    description: "قاعة متوسطة بنظام المحاسبة لكل طالب حاضر.",
  },
  {
    key: "teeba",
    name: "قاعة طيبة",
    capacity: 30,
    price: EGP(450),
    methods: ["whole_room_percent", "per_attending_student"],
    description: "قاعة مرنة — المدرّس يختار طريقة الحساب وقت الحجز.",
  },
];

// ── Courses ─────────────────────────────────────────────────────────────────
// Catalog subject/grade are resolved by CODE at runtime so the seed follows the
// real catalog rather than hard-coding ids that differ per environment.
const COURSES = [
  {
    key: "physics-3sec",
    title: "فيزياء — الثالث الثانوي",
    teacher: T_PHYSICS,
    room: "nile",
    subjectCode: "physics",
    gradeCode: "general-secondary-3",
    daysOfWeek: [6, 2], // Saturday, Tuesday
    startTime: "16:00",
    endTime: "18:00",
    perMonth: EGP(900),
    perSession: EGP(150),
    maxStudents: 35,
    studentIdx: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  {
    key: "chem-3sec",
    title: "كيمياء — الثالث الثانوي",
    teacher: T_CHEM,
    room: "amal",
    subjectCode: "chemistry",
    gradeCode: "general-secondary-3",
    daysOfWeek: [0, 3], // Sunday, Wednesday
    startTime: "18:30",
    endTime: "20:00",
    perMonth: EGP(800),
    perSession: EGP(130),
    maxStudents: 24,
    studentIdx: [0, 2, 4, 6, 8, 9],
  },
  {
    key: "math-2sec",
    title: "رياضيات — الثاني الثانوي",
    teacher: T_MATH,
    room: "teeba",
    subjectCode: "math",
    gradeCode: "general-secondary-2",
    daysOfWeek: [1, 4], // Monday, Thursday
    startTime: "15:00",
    endTime: "17:00",
    perMonth: EGP(750),
    perSession: EGP(120),
    maxStudents: 30,
    studentIdx: [8, 9, 10, 11],
  },
  {
    key: "physics-2sec",
    title: "فيزياء — الثاني الثانوي",
    teacher: T_PHYSICS,
    room: "teeba",
    subjectCode: "physics",
    gradeCode: "general-secondary-2",
    daysOfWeek: [5], // Friday
    startTime: "10:00",
    endTime: "12:00",
    perMonth: EGP(700),
    perSession: EGP(120),
    maxStudents: 30,
    studentIdx: [8, 10, 11],
  },
];

/**
 * Attendance pattern per student index within a completed session.
 *
 * `counter_only` is the one worth seeding deliberately: it is the student who
 * passed the front desk but never reached the hall, and the whole point of the
 * two-stage mode is that they are visibly NOT present. A screenshot that never
 * shows one would misrepresent the feature.
 */
const ATTENDANCE_CYCLE: AttendanceStatus[] = [
  "present",
  "present",
  "present",
  "absent",
  "present",
  "counter_only",
  "present",
  "late",
];

async function purge() {
  console.log("Purging showcase demo data…");
  await withPlatformContext(async (tx) => {
    // Resolve by NATURAL keys, not derived ids.
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);

    const centers = await tx.center.findMany({
      where: { OR: [{ shortId: CENTER_SHORT_ID }, { id: CENTER }] },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);

    const courses = await tx.course.findMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    const sessions = await tx.session.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    // Children first — these carry FKs into the rows deleted below.
    await tx.attendanceRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.gradeScore.deleteMany({ where: { studentId: { in: ids } } });
    await tx.grade.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.material.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });

    const notes = await tx.teamNote.findMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
      select: { id: true },
    });
    const noteIds = notes.map((n) => n.id);
    await tx.teamNoteRead.deleteMany({ where: { noteId: { in: noteIds } } });
    await tx.teamNote.deleteMany({ where: { id: { in: noteIds } } });

    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.parentStudentLink.deleteMany({
      where: { OR: [{ parentId: { in: ids } }, { studentId: { in: ids } }] },
    });
    await tx.centerStudentRoster.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.teacherAssistant.deleteMany({ where: { assistantId: { in: ids } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.room.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.parentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });

    // Raw hard delete: `user.deleteMany` is soft-delete-intercepted and would
    // leave the UNIQUE emails behind (P2002 on the next run) — the exact trap
    // that made earlier demo purges silent no-ops.
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", {
      users: hardDeleted,
      centers: centerIds.length,
      courses: courseIds.length,
      sessions: sessionIds.length,
      notes: noteIds.length,
    });
  });
}

/**
 * Each phase is its OWN transaction.
 *
 * The first draft did all of this in one `withPlatformContext`, which is how
 * the other demo seeds are written — and it died on Prisma's 20s interactive
 * transaction limit at ~300 sequential round trips against remote Neon. Raising
 * the timeout would have "fixed" it by holding write locks on a shared dev
 * database for minutes while other worktrees are running against it, so the
 * work is split instead and the bulk rows go in as batches.
 *
 * Phases are independently idempotent, so a failure part-way through is
 * resumable by re-running rather than by purging first.
 */
async function phase<T>(name: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await withPlatformContext(fn, { timeout: 30_000 });
  console.log(`  ✓ ${name} (${Date.now() - started}ms)`);
  return result;
}

async function main() {
  await assertNotProduction("showcase-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding showcase demo…");

  // ── catalog lookups (READ ONLY) ─────────────────────────────────────────
  const catalog = await phase("catalog", async (tx) => {
    const system = await tx.educationSystem.findFirst({ where: { code: "general" } });
    if (!system) throw new Error("Catalog missing: run `bun run seed` first.");

    const grades = await tx.gradeLevel.findMany({
      where: { code: { in: [...new Set(COURSES.map((c) => c.gradeCode))] } },
    });
    const subjects = await tx.subject.findMany({
      where: { code: { in: [...new Set(COURSES.map((c) => c.subjectCode))] } },
    });

    const gradeByCode = new Map(grades.map((g) => [g.code, g]));
    const subjectByCode = new Map(subjects.map((s) => [s.code, s]));
    for (const c of COURSES) {
      if (!gradeByCode.has(c.gradeCode)) throw new Error(`No grade level ${c.gradeCode}`);
      if (!subjectByCode.has(c.subjectCode)) throw new Error(`No subject ${c.subjectCode}`);
    }
    return { system, gradeByCode, subjectByCode };
  });

  // ── users ───────────────────────────────────────────────────────────────
  // Upserted in slices: 33 users is already most of a transaction budget on
  // its own when each row is a separate round trip.
  for (let i = 0; i < ALL.length; i += 12) {
    const slice = ALL.slice(i, i + 12);
    await phase(`users ${i + 1}–${i + slice.length}`, async (tx) => {
      for (const p of slice) {
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
            emailVerified: true,
            isDemo: true,
          },
        });
      }
    });
  }

  // ── center, staff, halls ────────────────────────────────────────────────
  const roomIds = await phase("center + staff + halls", async (tx) => {
    await tx.center.upsert({
      where: { id: CENTER },
      update: { isDemo: true, status: "active" },
      create: {
        id: CENTER,
        name: "سنتر النيل التعليمي",
        shortId: CENTER_SHORT_ID,
        description: "سنتر تعليمي للمرحلة الثانوية — فيزياء وكيمياء ورياضيات.",
        address: "٢٧ شارع الجلاء",
        area: "المنيرة",
        governorate: "الجيزة",
        phone: "0100-000-0000",
        status: "active",
        ownerUserId: OWNER.id,
        onboardingCompleted: true,
        classroomCount: ROOMS.length,
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: OWNER.id },
      update: { centerId: CENTER },
      create: { userId: OWNER.id, centerId: CENTER },
    });

    for (const [person, role, title] of STAFF) {
      await tx.centerStaff.upsert({
        where: { centerId_staffUserId: { centerId: CENTER, staffUserId: person.id } },
        update: { role, title, removedAt: null },
        create: { centerId: CENTER, staffUserId: person.id, role, title },
      });
    }

    const ids = new Map<string, string>();
    for (const r of ROOMS) {
      const id = did(`room:${r.key}`);
      ids.set(r.key, id);
      await tx.room.upsert({
        where: { id },
        update: {
          name: r.name,
          capacity: r.capacity,
          price: r.price,
          description: r.description,
          allowedPricingMethods: r.methods,
          isActive: true,
        },
        create: {
          id,
          centerId: CENTER,
          name: r.name,
          capacity: r.capacity,
          price: r.price,
          description: r.description,
          allowedPricingMethods: r.methods,
          facilities: ["سبورة ذكية", "تكييف"],
        },
      });
    }
    return ids;
  });

  // ── teachers, assistants, affiliations ──────────────────────────────────
  await phase("teachers + assistants", async (tx) => {
    for (const t of TEACHERS) {
      await tx.teacherProfile.upsert({
        where: { userId: t.id },
        update: {},
        create: {
          userId: t.id,
          bio: "مدرّس بخبرة في المرحلة الثانوية.",
          experienceYears: 8,
          onboardingCompleted: true,
          // The two-stage door check-in is per-teacher, so ONE teacher runs it
          // and the others do not — a screenshot set where everyone is
          // identical would misrepresent the setting as global.
          attendanceMode: t.key === "hossam" ? "counter_and_door" : "counter_only",
          walletBalance: 0,
        },
      });
      await tx.centerTeacherAffiliation.upsert({
        where: { id: did(`affil:${t.key}`) },
        update: { status: "active", removedAt: null },
        create: {
          id: did(`affil:${t.key}`),
          centerId: CENTER,
          teacherId: t.id,
          status: "active",
          centerShare: 0,
          respondedAt: daysFromNow(-60),
          expiresAt: daysFromNow(300),
        },
      });
    }

    for (const [assistant, teacher] of [
      [A_NOUR, T_PHYSICS],
      [A_EYAD, T_CHEM],
    ] as const) {
      await tx.teacherAssistant.upsert({
        where: {
          teacherId_assistantId: { teacherId: teacher.id, assistantId: assistant.id },
        },
        update: { removedAt: null },
        create: { teacherId: teacher.id, assistantId: assistant.id, title: "مساعد تدريس" },
      });
    }
  });

  // ── students ────────────────────────────────────────────────────────────
  // Ages and guardian contacts are deliberately mixed: most are minors with an
  // approved guardian, two have NO guardian email (so the child-safety gate is
  // visibly ACTIVE on a real screen), one is a verified adult. A cohort where
  // every student looks identical would hide the feature the /parents page is
  // built around.
  const sec3 = catalog.gradeByCode.get("general-secondary-3")!;
  const sec2 = catalog.gradeByCode.get("general-secondary-2")!;

  for (let i = 0; i < STUDENTS.length; i += 6) {
    const slice = STUDENTS.slice(i, i + 6);
    await phase(`students ${i + 1}–${i + slice.length}`, async (tx) => {
      for (const s of slice) {
        const idx = STUDENTS.indexOf(s);
        const inSec3 = idx < 8;
        const isVerifiedAdult = idx === 6;
        const hasGuardianEmail = idx !== 5 && idx !== 11;
        const grade = inSec3 ? sec3 : sec2;

        await tx.studentProfile.upsert({
          where: { userId: s.id },
          update: { fullName: s.name },
          create: {
            userId: s.id,
            fullName: s.name,
            familyLinkCode: `SHOW${String(idx + 1).padStart(3, "0")}`,
            educationSystemId: catalog.system.id,
            stageId: grade.stageId,
            gradeLevelId: grade.id,
            onboardingCompleted: true,
            dateOfBirth: isVerifiedAdult ? new Date("2007-03-14") : new Date("2009-06-01"),
            dateOfBirthVerifiedAt: isVerifiedAdult ? daysFromNow(-30) : null,
            guardianEmail: hasGuardianEmail
              ? `showcasedemo-guardian-${idx + 1}@edura.test`
              : null,
            guardianEmailAddedAt: hasGuardianEmail ? daysFromNow(-45) : null,
            // Never reset by a re-send; only set when we learn there is none.
            guardianContactDueAt: hasGuardianEmail ? null : daysFromNow(6),
            pointsBalance: 0,
            walletBalance: 0,
          },
        });

        await tx.centerStudentRoster.upsert({
          where: { id: did(`roster:${s.key}`) },
          update: { leftAt: null },
          create: {
            id: did(`roster:${s.key}`),
            centerId: CENTER,
            studentId: s.id,
            addedAt: daysFromNow(-50),
          },
        });
      }
    });
  }

  // ── parents + links ─────────────────────────────────────────────────────
  // Link states cover approved / pending / revoked, because parent oversight
  // behaves differently in each and /parents presents those limits AS the
  // feature rather than as restrictions.
  await phase("parents + links", async (tx) => {
    for (const p of PARENTS) {
      await tx.parentProfile.upsert({
        where: { userId: p.id },
        update: {},
        create: { userId: p.id, walletBalance: 0 },
      });
    }
    const LINKS: [Person, Person, "approved" | "pending" | "revoked"][] = [
      [PARENTS[0]!, STUDENTS[0]!, "approved"],
      [PARENTS[0]!, STUDENTS[4]!, "approved"],
      [PARENTS[1]!, STUDENTS[1]!, "approved"],
      [PARENTS[1]!, STUDENTS[8]!, "pending"],
      [PARENTS[2]!, STUDENTS[2]!, "approved"],
      [PARENTS[2]!, STUDENTS[9]!, "revoked"],
    ];
    for (const [parent, student, status] of LINKS) {
      const id = did(`link:${parent.key}:${student.key}`);
      await tx.parentStudentLink.upsert({
        where: { id },
        update: { status },
        create: {
          id,
          parentId: parent.id,
          studentId: student.id,
          status,
          initiatedBy: "parent",
          revokedBy: status === "revoked" ? "parent" : null,
        },
      });
    }
  });

  // ── one transaction per course ──────────────────────────────────────────
  // Course + enrollments + 8 weeks of sessions + attendance + gradebook +
  // materials. The bulk rows are delete-then-createMany rather than N upserts:
  // one round trip instead of ~90, which is what keeps a course inside the
  // transaction budget. Safe because every row deleted is scoped to this
  // course, which this seed owns outright.
  const totals = { sessions: 0, attendance: 0, grades: 0, materials: 0 };

  for (const c of COURSES) {
    await phase(`course ${c.key}`, async (tx) => {
      const courseId = did(`course:${c.key}`);
      const grade = catalog.gradeByCode.get(c.gradeCode)!;
      const subject = catalog.subjectByCode.get(c.subjectCode)!;
      const roomId = roomIds.get(c.room)!;
      const room = ROOMS.find((r) => r.key === c.room)!;

      // A course carries ONE pricing method, snapshotted at creation —
      // changing the hall's rate later never re-prices a running course.
      const pricingMethod: RoomPricingMethod = room.methods.includes("per_attending_student")
        ? "per_attending_student"
        : "whole_room_percent";
      const isPercent = pricingMethod === "whole_room_percent";

      await tx.course.upsert({
        where: { id: courseId },
        update: { title: c.title, status: "active", isDemo: true },
        create: {
          id: courseId,
          centerId: CENTER,
          teacherId: c.teacher.id,
          defaultRoomId: roomId,
          title: c.title,
          subject: subject.nameAr,
          subjectId: subject.id,
          gradeTag: grade.nameAr,
          gradeLevelId: grade.id,
          daysOfWeek: c.daysOfWeek,
          startTime: c.startTime,
          endTime: c.endTime,
          startDate: daysFromNow(-45),
          endDate: daysFromNow(90),
          price: c.perMonth,
          pricePerMonth: c.perMonth,
          pricePerSession: c.perSession,
          pricingMethod,
          // The 3-way split snapshot the settlement engine reads. Basis points.
          splitPlatformBp: 1000,
          splitTeacherBp: isPercent ? 6500 : null,
          splitCenterBp: isPercent ? 2500 : null,
          m2CenterFee: isPercent ? null : EGP(25),
          maxStudents: c.maxStudents,
          status: "active",
          isDemo: true,
        },
      });

      const students = c.studentIdx.map((i) => STUDENTS[i]!);

      await tx.enrollment.deleteMany({ where: { courseId } });
      await tx.enrollment.createMany({
        data: students.map((s) => ({
          id: did(`enroll:${c.key}:${s.key}`),
          studentId: s.id,
          courseId,
          centerId: CENTER,
          status: "active" as const,
          enrolledAt: daysFromNow(-40),
          enrolledBy: OWNER.id,
        })),
        skipDuplicates: true,
      });

      // Eight weeks: four already completed (so attendance history and the
      // register render) and four upcoming (so the schedule renders).
      const sessions: {
        id: string;
        date: Date;
        past: boolean;
        weekOffset: number;
        dow: number;
      }[] = [];
      for (let w = -4; w < 4; w++) {
        for (const dow of c.daysOfWeek) {
          const date = nextWeekday(dow, w);
          sessions.push({
            id: did(`session:${c.key}:${w}:${dow}`),
            date,
            past: date.getTime() < Date.now(),
            weekOffset: w,
            dow,
          });
        }
      }

      const sessionIds = sessions.map((s) => s.id);
      await tx.attendanceRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
      await tx.session.createMany({
        data: sessions.map((s) => ({
          id: s.id,
          courseId,
          teacherId: c.teacher.id,
          roomId,
          originalDate: s.date,
          date: s.date,
          startTime: c.startTime,
          endTime: c.endTime,
          status: s.past ? ("completed" as const) : ("scheduled" as const),
          // NULL on purpose: distribution is what writes money, and money is
          // not this seed's to write. See the file header.
          distributedAt: null,
        })),
        skipDuplicates: true,
      });
      totals.sessions += sessions.length;

      const doorMode = c.teacher.key === "hossam";
      const attendance = sessions
        .filter((s) => s.past)
        .flatMap((s) =>
          students.map((student, n) => {
            const raw = ATTENDANCE_CYCLE[(n + s.weekOffset + 8) % ATTENDANCE_CYCLE.length]!;
            // `counter_only` can only OCCUR in two-stage mode. In single-stage
            // mode the counter check-in IS the attendance, so the same student
            // resolves to present rather than to a status the engine could not
            // have produced there.
            const status: AttendanceStatus =
              doorMode || raw !== "counter_only" ? raw : "present";
            const counterAt =
              status === "absent" ? null : new Date(s.date.getTime() - 15 * 60 * 1000);
            // Two-stage `counter_only` is precisely "reached the desk, never
            // reached the hall": a counter stamp and NO door stamp.
            const doorAt =
              doorMode && counterAt && status !== "counter_only"
                ? new Date(s.date.getTime() - 2 * 60 * 1000)
                : null;

            return {
              id: did(`att:${c.key}:${s.weekOffset}:${s.dow}:${student.key}`),
              sessionId: s.id,
              studentId: student.id,
              courseId,
              centerId: CENTER,
              status,
              markedBy: c.teacher.id,
              counterAt,
              counterBy: counterAt ? RECEPTION.id : null,
              doorAt,
              doorBy: doorAt ? A_NOUR.id : null,
              synced: true,
            };
          }),
        );
      await tx.attendanceRecord.createMany({ data: attendance, skipDuplicates: true });
      totals.attendance += attendance.length;

      // Gradebook. Scores are spread across the band on purpose: a column where
      // every student sits at 90% shows nothing about the screen's actual job,
      // which is making an outlier findable in a long list.
      const GRADES = [
        { key: "quiz1", name: "اختبار الباب الأول", max: 20, daysAgo: 28 },
        { key: "midterm", name: "امتحان منتصف الترم", max: 50, daysAgo: 14 },
        { key: "quiz2", name: "اختبار الباب الثاني", max: 20, daysAgo: 5 },
      ];
      const gradeIds = GRADES.map((g) => did(`grade:${c.key}:${g.key}`));
      await tx.gradeScore.deleteMany({ where: { gradeId: { in: gradeIds } } });
      await tx.grade.deleteMany({ where: { id: { in: gradeIds } } });
      await tx.grade.createMany({
        data: GRADES.map((g, i) => ({
          id: gradeIds[i]!,
          courseId,
          centerId: CENTER,
          teacherId: c.teacher.id,
          name: g.name,
          gradeType: "numeric" as const,
          maxScore: g.max,
          date: daysFromNow(-g.daysAgo),
        })),
        skipDuplicates: true,
      });
      await tx.gradeScore.createMany({
        data: GRADES.flatMap((g, gi) =>
          students.map((s, n) => ({
            gradeId: gradeIds[gi]!,
            studentId: s.id,
            score: Math.round(g.max * (0.45 + (((n * 7 + gi * 3) % 12) / 11) * 0.55) * 2) / 2,
          })),
        ),
        skipDuplicates: true,
      });
      totals.grades += GRADES.length;

      const MATERIALS = [
        { key: "notes", title: "ملخص الباب الثالث", type: "lecture" as const },
        { key: "hw", title: "واجب الأسبوع", type: "homework" as const },
      ];
      const materialIds = MATERIALS.map((m) => did(`material:${c.key}:${m.key}`));
      await tx.material.deleteMany({ where: { id: { in: materialIds } } });
      await tx.material.createMany({
        data: MATERIALS.map((m, i) => ({
          id: materialIds[i]!,
          courseId,
          centerId: CENTER,
          teacherId: c.teacher.id,
          title: m.title,
          type: m.type,
          // `external`, not `cloudinary`: the seed must not imply an uploaded
          // asset that does not exist in the media account.
          storageProvider: "external" as const,
          externalUrl: "https://example.invalid/showcase-demo.pdf",
          fileSizeBytes: 248_000,
        })),
        skipDuplicates: true,
      });
      totals.materials += MATERIALS.length;
    });
  }

  // ── team notes (center board + teacher board) ───────────────────────────
  const NOTES = [
    {
      key: "c-pinned",
      centerId: CENTER,
      author: OWNER,
      body: "تذكير: مراجعة جدول قاعة النيل قبل بداية الشهر الجديد.",
      pinned: true,
      status: "open" as const,
      readers: [RECEPTION, MANAGER],
    },
    {
      key: "c-open",
      centerId: CENTER,
      author: MANAGER,
      body: "طلب صيانة للتكييف في قاعة الأمل.",
      status: "open" as const,
      readers: [OWNER],
    },
    {
      key: "c-done",
      centerId: CENTER,
      author: RECEPTION,
      body: "تم تحديث بيانات أولياء الأمور الناقصة على الكاونتر.",
      status: "done" as const,
      statusChangedBy: MANAGER,
      readers: [OWNER, MANAGER, ACCOUNTANT],
    },
    {
      key: "t-open",
      teacherId: T_PHYSICS.id,
      author: A_NOUR,
      body: "تجهيز أوراق امتحان الباب الثالث لمجموعة السبت.",
      status: "open" as const,
      readers: [T_PHYSICS],
    },
    {
      key: "t-declined",
      teacherId: T_PHYSICS.id,
      author: T_PHYSICS,
      body: "نقل حصة الثلاثاء لقاعة طيبة.",
      status: "declined" as const,
      statusChangedBy: A_NOUR,
      readers: [A_NOUR],
    },
  ];

  await phase("team notes", async (tx) => {
    for (const n of NOTES) {
      const id = did(`note:${n.key}`);
      await tx.teamNote.upsert({
        where: { id },
        update: { body: n.body, status: n.status, deletedAt: null },
        create: {
          id,
          centerId: n.centerId ?? null,
          teacherId: n.teacherId ?? null,
          authorUserId: n.author.id,
          body: n.body,
          pinned: n.pinned ?? false,
          status: n.status,
          statusChangedById: n.statusChangedBy?.id ?? null,
          statusChangedAt: n.statusChangedBy ? daysFromNow(-1) : null,
        },
      });
      await tx.teamNoteRead.createMany({
        data: [n.author, ...n.readers].map((p) => ({ noteId: id, userId: p.id })),
        skipDuplicates: true,
      });
    }
  });

  console.log("\nSeeded:", {
    users: ALL.length,
    rooms: ROOMS.length,
    courses: COURSES.length,
    ...totals,
    notes: NOTES.length,
    moneyRows: 0,
  });

  console.log(`\nLogins (password: ${PASSWORD}):`);
  const show = [
    OWNER,
    RECEPTION,
    MANAGER,
    ACCOUNTANT,
    ...TEACHERS,
    A_NOUR,
    A_EYAD,
    PARENTS[0]!,
    STUDENTS[0]!,
  ];
  for (const p of show) console.log(`  ${p.role.padEnd(13)} ${email(p)}  (${p.name})`);
  console.log("\nNOTE: finance screens are EMPTY by design — this seed writes NO money rows.");
  console.log("Run a real payment flow in the preview to produce ledger figures.");
}

/**
 * The date of `dayOfWeek` in the week `weekOffset` weeks from this one, at
 * midday UTC. Midday avoids a session silently landing on the previous day
 * once Africa/Cairo's offset is applied.
 */
function nextWeekday(dayOfWeek: number, weekOffset: number): Date {
  const base = new Date();
  base.setUTCHours(12, 0, 0, 0);
  const delta = dayOfWeek - base.getUTCDay();
  return new Date(base.getTime() + (delta + weekOffset * 7) * DAY);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
