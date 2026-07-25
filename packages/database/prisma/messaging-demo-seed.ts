/* eslint-disable no-console */
/**
 * ============================================================================
 * MESSAGING DEMO SEED — throwaway is_demo data for previewing the messaging UI
 * ============================================================================
 * Builds a small but REALISTIC two-center world so every messaging screen has
 * something in it, and so the scoping rules are visible by inspection:
 *
 *   Center ALPHA                          Center BETA
 *     admin  : Hoda (center_admin)          admin : Tarek (center_admin)
 *     staff  : Mona (receptionist)          teacher: Nabil  + assistant Rania
 *     teacher: Kamal + assistant Salma
 *     course : Physics — Grade 3 Secondary
 *     students: Youssef (MINOR, no DOB), Layla (VERIFIED ADULT, 19)
 *     parent : Amira -> approved link to Youssef
 *
 * The two centers exist precisely so the preview shows ISOLATION: nothing in
 * ALPHA can reach anything in BETA, and the contacts directory proves it by
 * simply not listing them.
 *
 * SAFETY (same contract as preview-seed.ts):
 *   • Every ROOT entity (User / Center / Course) is flagged isDemo = true, and
 *     so are the conversations and channels themselves.
 *   • ZERO writes to any money / ledger / wallet table: no transactions,
 *     payments, payouts, invoices, expenses, points_ledger, subscriptions.
 *     wallet_balance / points_balance stay at their 0 default.
 *   • The permanent Egyptian catalog is READ, never written.
 *   • Real staff accounts are never touched.
 *
 * Idempotent: deterministic ids, re-run safely.
 *
 *   Seed:  pnpm exec tsx --env-file=.env prisma/messaging-demo-seed.ts
 *   Purge: pnpm exec tsx --env-file=.env prisma/messaging-demo-seed.ts --purge
 * ============================================================================
 */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import type { Role } from "../src/generated/client/index";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const MIN = 60 * 1000;

/** Deterministic UUID from a stable key -> idempotent upsert-by-id. */
function did(key: string): string {
  const h = createHash("sha1").update("edura-msgdemo:" + key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
const flc = (id: string) =>
  createHash("sha1").update("flc:" + id).digest("hex").slice(0, 10).toUpperCase();

/** Minutes ago, so the demo threads read as a recent conversation. */
const ago = (m: number) => new Date(Date.now() - m * MIN);

type Person = { id: string; key: string; name: string; role: Role };

const P = (key: string, name: string, role: Role): Person => ({
  id: did(key),
  key,
  name,
  role,
});

// ---- the cast ------------------------------------------------------------
const HODA = P("hoda", "هدى منصور", "center_admin");
const MONA = P("mona", "منى عبد الله", "center_staff");
const KAMAL = P("kamal", "أ. كمال الشناوي", "teacher");
const SALMA = P("salma", "سلمى إبراهيم", "assistant");
const YOUSSEF = P("youssef", "يوسف أحمد", "student");
const LAYLA = P("layla", "ليلى فؤاد", "student");
const AMIRA = P("amira", "أميرة سعيد", "parent");

const TAREK = P("tarek", "طارق حلمي", "center_admin");
const NABIL = P("nabil", "أ. نبيل رشدي", "teacher");
const RANIA = P("rania", "رانيا مجدي", "assistant");
const OMAR = P("omar", "عمر خالد", "student");

const ALL = [HODA, MONA, KAMAL, SALMA, YOUSSEF, LAYLA, AMIRA, TAREK, NABIL, RANIA, OMAR];

const ALPHA = did("center:alpha");
const BETA = did("center:beta");
const COURSE_ALPHA = did("course:alpha-physics");
const COURSE_BETA = did("course:beta-chem");
const GROUP_ALPHA = did("group:alpha-physics");

async function purge() {
  console.log("Purging messaging demo data…");
  await withPlatformContext(async (tx) => {
    const ids = ALL.map((p) => p.id);
    // Children first (no FK cascade from users).
    await tx.groupMessage.deleteMany({ where: { groupId: GROUP_ALPHA } });
    await tx.groupMember.deleteMany({ where: { groupId: GROUP_ALPHA } });
    await tx.conversationGroup.deleteMany({ where: { id: GROUP_ALPHA } });
    await tx.conversationReport.deleteMany({
      where: { OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }] },
    });
    await tx.conversationBlock.deleteMany({
      where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
    });
    const convs = await tx.conversation.findMany({
      where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
      select: { id: true },
    });
    await tx.conversationMessage.deleteMany({
      where: { conversationId: { in: convs.map((c) => c.id) } },
    });
    await tx.conversation.deleteMany({ where: { id: { in: convs.map((c) => c.id) } } });

    await tx.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await tx.parentStudentLink.deleteMany({ where: { parentId: { in: ids } } });
    await tx.teacherAssistant.deleteMany({ where: { assistantId: { in: ids } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.centerStudentRoster.deleteMany({ where: { studentId: { in: ids } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.course.deleteMany({ where: { id: { in: [COURSE_ALPHA, COURSE_BETA] } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.parentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: [ALPHA, BETA] } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
  console.log("Purged.");
}

async function main() {
  // Demo data must never reach production — in either direction. The purge path
  // is guarded too: it deletes the demo world it created, which is correct on a
  // dev database and unacceptable as a stray command against production.
  await assertNotProduction("messaging-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding messaging demo…");

  await withPlatformContext(async (tx) => {
    // ---- users ----------------------------------------------------------
    for (const p of ALL) {
      await tx.user.upsert({
        where: { id: p.id },
        update: { name: p.name, status: "active", isDemo: true },
        create: {
          id: p.id,
          name: p.name,
          role: p.role,
          email: `msgdemo-${p.key}@edura.test`,
          passwordHash: hash,
          status: "active",
          locale: "ar",
          isDemo: true,
        },
      });
    }

    // ---- centers --------------------------------------------------------
    await tx.center.upsert({
      where: { id: ALPHA },
      update: { isDemo: true },
      create: {
        id: ALPHA,
        name: "سنتر النخبة",
        shortId: "MSGDEMOALFA",
        status: "active",
        ownerUserId: HODA.id,
        isDemo: true,
      },
    });
    await tx.center.upsert({
      where: { id: BETA },
      update: { isDemo: true },
      create: {
        id: BETA,
        name: "سنتر الأوائل",
        shortId: "MSGDEMOBETA",
        status: "active",
        ownerUserId: TAREK.id,
        isDemo: true,
      },
    });

    for (const [user, center] of [
      [HODA, ALPHA],
      [TAREK, BETA],
    ] as const) {
      await tx.centerAdminProfile.upsert({
        where: { userId: user.id },
        update: { centerId: center },
        create: { userId: user.id, centerId: center },
      });
    }

    // Receptionist at ALPHA — the sub-role that reaches families only.
    await tx.centerStaff.upsert({
      where: { centerId_staffUserId: { centerId: ALPHA, staffUserId: MONA.id } },
      update: { role: "receptionist", removedAt: null },
      create: {
        centerId: ALPHA,
        staffUserId: MONA.id,
        role: "receptionist",
        title: "مكتب الاستقبال",
      },
    });

    // ---- teachers, assistants, affiliations ------------------------------
    for (const teacher of [KAMAL, NABIL]) {
      await tx.teacherProfile.upsert({
        where: { userId: teacher.id },
        update: {},
        create: { userId: teacher.id, walletBalance: 0 },
      });
    }
    for (const [teacher, center] of [
      [KAMAL, ALPHA],
      [NABIL, BETA],
    ] as const) {
      await tx.centerTeacherAffiliation.upsert({
        where: { id: did(`aff:${teacher.key}`) },
        update: { status: "active" },
        create: {
          id: did(`aff:${teacher.key}`),
          centerId: center,
          teacherId: teacher.id,
          status: "active",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      });
    }
    for (const [assistant, teacher] of [
      [SALMA, KAMAL],
      [RANIA, NABIL],
    ] as const) {
      await tx.teacherAssistant.upsert({
        where: { teacherId_assistantId: { teacherId: teacher.id, assistantId: assistant.id } },
        update: { removedAt: null },
        create: {
          teacherId: teacher.id,
          assistantId: assistant.id,
          title: "مساعد المدرّس",
        },
      });
    }

    // ---- students --------------------------------------------------------
    // Youssef: NO date of birth at all -> MINOR under the default-minor rule,
    // so parent oversight is active for him. This is the common real case.
    await tx.studentProfile.upsert({
      where: { userId: YOUSSEF.id },
      update: { dateOfBirth: null, dateOfBirthVerifiedAt: null },
      create: {
        userId: YOUSSEF.id,
        fullName: YOUSSEF.name,
        familyLinkCode: flc(YOUSSEF.id),
      },
    });
    // Layla: a VERIFIED 19-year-old -> the only way to be an adult. Her
    // conversations are private; the oversight screen says so explicitly.
    await tx.studentProfile.upsert({
      where: { userId: LAYLA.id },
      update: {
        dateOfBirth: new Date("2006-04-11T00:00:00Z"),
        dateOfBirthVerifiedAt: new Date("2026-01-15T00:00:00Z"),
      },
      create: {
        userId: LAYLA.id,
        fullName: LAYLA.name,
        familyLinkCode: flc(LAYLA.id),
        dateOfBirth: new Date("2006-04-11T00:00:00Z"),
        dateOfBirthVerifiedAt: new Date("2026-01-15T00:00:00Z"),
      },
    });
    await tx.studentProfile.upsert({
      where: { userId: OMAR.id },
      update: {},
      create: {
        userId: OMAR.id,
        fullName: OMAR.name,
        familyLinkCode: flc(OMAR.id),
      },
    });
    await tx.parentProfile.upsert({
      where: { userId: AMIRA.id },
      update: {},
      create: { userId: AMIRA.id },
    });
    await tx.parentStudentLink.upsert({
      where: { id: did("link:amira-youssef") },
      update: { status: "approved" },
      create: {
        id: did("link:amira-youssef"),
        parentId: AMIRA.id,
        studentId: YOUSSEF.id,
        status: "approved",
        initiatedBy: "parent",
      },
    });

    // ---- courses + enrollments (the relationships messaging derives from) --
    await tx.course.upsert({
      where: { id: COURSE_ALPHA },
      update: { isDemo: true },
      create: {
        id: COURSE_ALPHA,
        centerId: ALPHA,
        teacherId: KAMAL.id,
        title: "فيزياء — الصف الثالث الثانوي",
        subject: "فيزياء",
        daysOfWeek: [6, 2],
        startTime: "16:00",
        endTime: "18:00",
        startDate: new Date("2026-09-01T00:00:00Z"),
        price: 0,
        maxStudents: 40,
        isDemo: true,
      },
    });
    await tx.course.upsert({
      where: { id: COURSE_BETA },
      update: { isDemo: true },
      create: {
        id: COURSE_BETA,
        centerId: BETA,
        teacherId: NABIL.id,
        title: "كيمياء — الصف الثالث الثانوي",
        subject: "كيمياء",
        daysOfWeek: [0, 3],
        startTime: "14:00",
        endTime: "16:00",
        startDate: new Date("2026-09-01T00:00:00Z"),
        price: 0,
        maxStudents: 40,
        isDemo: true,
      },
    });

    for (const [student, course, center] of [
      [YOUSSEF, COURSE_ALPHA, ALPHA],
      [LAYLA, COURSE_ALPHA, ALPHA],
      [OMAR, COURSE_BETA, BETA],
    ] as const) {
      await tx.enrollment.upsert({
        where: { id: did(`enr:${student.key}`) },
        update: { status: "active" },
        create: {
          id: did(`enr:${student.key}`),
          studentId: student.id,
          courseId: course,
          centerId: center,
          status: "active",
          enrolledBy: student.id,
        },
      });
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: center, studentId: student.id } },
        update: { leftAt: null },
        create: { centerId: center, studentId: student.id },
      });
    }

    // ---- conversations ---------------------------------------------------
    const thread = async (
      key: string,
      a: Person,
      b: Person,
      centerId: string | null,
      lines: [Person, string, number][],
    ) => {
      const [userAId, userBId] =
        a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      const id = did("conv:" + key);
      const last = lines[lines.length - 1]!;
      await tx.conversation.upsert({
        where: { id },
        update: { isDemo: true },
        create: {
          id,
          userAId,
          userBId,
          centerId,
          isDemo: true,
          lastMessageAt: ago(last[2]),
          lastMessagePreview: last[1].slice(0, 140),
          lastMessageSenderId: last[0].id,
          // Unread on the RECIPIENT's side of the last message.
          aUnreadCount: last[0].id === userAId ? 0 : 1,
          bUnreadCount: last[0].id === userBId ? 0 : 1,
        },
      });
      let i = 0;
      for (const [sender, body, minutesAgo] of lines) {
        const mid = did(`msg:${key}:${i++}`);
        await tx.conversationMessage.upsert({
          where: { id: mid },
          update: {},
          create: {
            id: mid,
            conversationId: id,
            senderId: sender.id,
            body,
            status: "read",
            deliveredAt: ago(minutesAgo),
            readAt: ago(minutesAgo - 1),
            createdAt: ago(minutesAgo),
          },
        });
      }
      return id;
    };

    // A minor <-> teacher thread: this is the one the parent can oversee.
    const convYoussefKamal = await thread(
      "youssef-kamal",
      YOUSSEF,
      KAMAL,
      null,
      [
        [YOUSSEF, "السلام عليكم أستاذ، مش فاهم مسألة رقم ٤ في الواجب.", 180],
        [KAMAL, "وعليكم السلام يا يوسف. ابدأ بقانون نيوتن الثاني، وابعتلي خطواتك.", 174],
        [YOUSSEF, "تمام، هجربها وأبعتلك.", 170],
      ],
    );

    await thread("youssef-salma", YOUSSEF, SALMA, null, [
      [SALMA, "يا يوسف، فاضل تسليم الواجب بكرة الساعة ٨ مساءً.", 90],
      [YOUSSEF, "تمام يا مس، شكراً.", 86],
    ]);

    await thread("amira-kamal", AMIRA, KAMAL, null, [
      [AMIRA, "مساء الخير أستاذ، عايزة أطمن على مستوى يوسف.", 240],
      [KAMAL, "مساء النور. مستواه اتحسن كويس الشهر ده، بس محتاج يذاكر المسائل أكتر.", 232],
    ]);

    await thread("youssef-mona", YOUSSEF, MONA, ALPHA, [
      [MONA, "أهلاً يوسف، فاضل اشتراك شهر ده — تقدر تعدّيه على المكتب.", 300],
    ]);

    await thread("kamal-hoda", KAMAL, HODA, ALPHA, [
      [KAMAL, "لو سمحتي، ممكن نغيّر ميعاد حصة السبت للساعة ٥؟", 400],
      [HODA, "القاعة فاضية ٥، هظبطها من عندي.", 395],
    ]);

    await thread("kamal-salma", KAMAL, SALMA, null, [
      [KAMAL, "سلمى، من فضلك جهّزي كشف غياب حصة النهاردة.", 60],
      [SALMA, "تمام يا أستاذ، جاهز.", 55],
    ]);

    // ---- a derived-membership channel ------------------------------------
    await tx.conversationGroup.upsert({
      where: { id: GROUP_ALPHA },
      update: { isDemo: true },
      create: {
        id: GROUP_ALPHA,
        kind: "course",
        courseId: COURSE_ALPHA,
        centerId: ALPHA,
        ownerId: KAMAL.id,
        title: "فيزياء — الصف الثالث الثانوي",
        postPolicy: "owner_only",
        isDemo: true,
        lastMessageAt: ago(45),
        lastMessagePreview: "مراجعة الباب الأول يوم الجمعة الساعة ٦ مساءً.",
        lastMessageSenderId: KAMAL.id,
      },
    });
    // Membership MIRRORS the real roster (teacher + assistant + the two
    // enrolled students + the enrolled minor's parent + the center side). The
    // app re-derives this live on every read; the rows here are just the cache.
    for (const [person, role] of [
      [KAMAL, "teacher"],
      [SALMA, "assistant"],
      [YOUSSEF, "student"],
      [LAYLA, "student"],
      [AMIRA, "parent"],
      [HODA, "center_admin"],
      [MONA, "center_staff"],
    ] as const) {
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: GROUP_ALPHA, userId: person.id } },
        update: { leftAt: null },
        create: {
          groupId: GROUP_ALPHA,
          userId: person.id,
          role: role as Role,
          unreadCount: role === "teacher" ? 0 : 1,
        },
      });
    }
    for (const [i, [body, minutesAgo]] of (
      [
        ["أهلاً بيكم في قناة الحصة. هنا هينزل كل الإعلانات المهمة.", 600],
        ["الواجب الجديد اترفع على المنصة، آخر ميعاد الأربعاء.", 300],
        ["مراجعة الباب الأول يوم الجمعة الساعة ٦ مساءً.", 45],
      ] as [string, number][]
    ).entries()) {
      const mid = did(`gmsg:${i}`);
      await tx.groupMessage.upsert({
        where: { id: mid },
        update: {},
        create: {
          id: mid,
          groupId: GROUP_ALPHA,
          senderId: KAMAL.id,
          body,
          createdAt: ago(minutesAgo),
        },
      });
    }

    // ---- one open safety report + one block ------------------------------
    await tx.conversationReport.upsert({
      where: { id: did("report:1") },
      update: {},
      create: {
        id: did("report:1"),
        reporterId: YOUSSEF.id,
        reportedUserId: MONA.id,
        conversationId: did("conv:youssef-mona"),
        category: "spam",
        details: "رسائل متكررة عن الاشتراك.",
        status: "open",
        // Reporter is a minor -> flagged, sorts to the top of the queue.
        involvesMinor: true,
      },
    });
    await tx.conversationBlock.upsert({
      where: { id: did("block:1") },
      update: {},
      create: {
        id: did("block:1"),
        blockerId: LAYLA.id,
        blockedId: MONA.id,
        reason: "رسائل غير مرغوبة",
      },
    });

    console.log(`  conversations seeded (incl. ${convYoussefKamal.slice(0, 8)}… for oversight)`);
  });

  console.log("\nDemo logins (password: " + PASSWORD + ")");
  for (const p of ALL) {
    console.log(`  ${p.role.padEnd(13)} msgdemo-${p.key}@edura.test  — ${p.name}`);
  }
  console.log(
    "\nTry: log in as msgdemo-amira@edura.test -> Child safety, to see Youssef's\n" +
      "     conversations with staff (Layla is a verified adult and is excluded).",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
