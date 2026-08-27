import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role, TeamNoteStatus } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const MIN = 60 * 1000;

const did = seedId("edura-teamnotesdemo:");
const ago = (m: number) => new Date(Date.now() - m * MIN);

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({
  id: did(key),
  key,
  name,
  role,
});

const NADIA = P("nadia", "نادية عبد الرحمن", "center_admin");
const HEBA = P("heba", "هبة سمير", "center_staff");
const SAYED = P("sayed", "سيد فوزي", "center_staff");
const AFAF = P("afaf", "عفاف نور", "center_staff");
const FATHY = P("fathy", "أ. فتحي عبد العزيز", "teacher");
const DINA = P("dina", "دينا صلاح", "assistant");
const KARIM = P("karim", "كريم عادل", "assistant");

const ALL = [NADIA, HEBA, SAYED, AFAF, FATHY, DINA, KARIM];

const email = (p: Person) => `teamnotesdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);
const CENTER_SHORT_ID = "NOTESDEMO01";
const CENTER = did("center:notes");

async function purge() {
  console.log("Purging team-notes demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: { OR: [{ shortId: CENTER_SHORT_ID }, { id: CENTER }] },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);

    const notes = await tx.teamNote.findMany({
      where: {
        OR: [
          { centerId: { in: centerIds } },
          { teacherId: { in: ids } },
          { authorUserId: { in: ids } },
        ],
      },
      select: { id: true },
    });
    const noteIds = notes.map((n) => n.id);
    await tx.teamNoteRead.deleteMany({ where: { noteId: { in: noteIds } } });
    await tx.teamNote.deleteMany({ where: { id: { in: noteIds } } });

    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherAssistant.deleteMany({ where: { assistantId: { in: ids } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", {
      users: hardDeleted,
      centers: centerIds.length,
      notes: noteIds.length,
    });
  });
  console.log("Purged.");
}

async function main() {
  await assertNotProduction("team-notes-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding team-notes demo…");

  await withPlatformContext(async (tx) => {
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

    await tx.center.upsert({
      where: { id: CENTER },
      update: { isDemo: true },
      create: {
        id: CENTER,
        name: "سنتر المستقبل",
        shortId: CENTER_SHORT_ID,
        status: "active",
        ownerUserId: NADIA.id,
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: NADIA.id },
      update: { centerId: CENTER },
      create: { userId: NADIA.id, centerId: CENTER },
    });
    for (const [staff, role, title] of [
      [HEBA, "receptionist", "مكتب الاستقبال"],
      [SAYED, "manager", "مدير السنتر"],
      [AFAF, "center_accountant", "المحاسبة"],
    ] as const) {
      await tx.centerStaff.upsert({
        where: { centerId_staffUserId: { centerId: CENTER, staffUserId: staff.id } },
        update: { role, removedAt: null },
        create: { centerId: CENTER, staffUserId: staff.id, role, title },
      });
    }

    await tx.teacherProfile.upsert({
      where: { userId: FATHY.id },
      update: {},
      create: { userId: FATHY.id, walletBalance: 0 },
    });
    for (const assistant of [DINA, KARIM]) {
      await tx.teacherAssistant.upsert({
        where: {
          teacherId_assistantId: { teacherId: FATHY.id, assistantId: assistant.id },
        },
        update: { removedAt: null },
        create: {
          teacherId: FATHY.id,
          assistantId: assistant.id,
          title: "مساعد المدرّس",
        },
      });
    }

    type NoteSpec = {
      key: string;
      centerId?: string;
      teacherId?: string;
      author: Person;
      body: string;
      pinned?: boolean;
      status?: TeamNoteStatus;
      statusChangedBy?: Person;
      minutesAgo: number;
      readers: Person[];
    };
    const NOTES: NoteSpec[] = [
      {
        key: "c-pinned",
        centerId: CENTER,
        author: NADIA,
        body: "تنبيه مهم: كشف حضور مجموعة الثانوية العامة لازم يتسلم لمكتب الاستقبال قبل الساعة ٤ كل يوم.",
        pinned: true,
        minutesAgo: 60 * 26,
        readers: [HEBA, SAYED],
      },
      {
        key: "c-open",
        centerId: CENTER,
        author: HEBA,
        body: "ولي أمر الطالب أحمد سعيد هيعدّي بكرة الصبح يدفع كاش — حد يستقبله لو مش موجودة.",
        minutesAgo: 60 * 3,
        readers: [SAYED],
      },
      {
        key: "c-done",
        centerId: CENTER,
        author: SAYED,
        body: "محتاجين نطبع كشوف قاعة ٢ قبل حصة الفيزياء يوم الخميس.",
        status: "done",
        statusChangedBy: HEBA,
        minutesAgo: 60 * 20,
        readers: [NADIA, HEBA, AFAF],
      },
      {
        key: "c-declined",
        centerId: CENTER,
        author: HEBA,
        body: "اقتراح: نأجل حصة الكيمياء ليوم السبت عشان تعارض المواعيد.",
        status: "declined",
        statusChangedBy: NADIA,
        minutesAgo: 60 * 44,
        readers: [NADIA, SAYED],
      },
      {
        key: "t-pinned",
        teacherId: FATHY.id,
        author: FATHY,
        body: "رجاءً مراجعة غياب مجموعة الجمعة قبل إرسال التقرير الأسبوعي لأولياء الأمور.",
        pinned: true,
        minutesAgo: 60 * 8,
        readers: [DINA],
      },
      {
        key: "t-open",
        teacherId: FATHY.id,
        author: DINA,
        body: "ورقة امتحان الوحدة الثالثة جاهزة للطباعة — ٤٠ نسخة لمجموعة الأحد.",
        minutesAgo: 45,
        readers: [],
      },
      {
        key: "t-done",
        teacherId: FATHY.id,
        author: KARIM,
        body: "تحديث درجات الاختبار القصير على النظام.",
        status: "done",
        statusChangedBy: DINA,
        minutesAgo: 60 * 30,
        readers: [FATHY, DINA],
      },
    ];

    for (const n of NOTES) {
      const id = did(`note:${n.key}`);
      const status: TeamNoteStatus = n.status ?? "open";
      await tx.teamNote.upsert({
        where: { id },
        update: {
          body: n.body,
          pinned: n.pinned ?? false,
          status,
          deletedAt: null,
        },
        create: {
          id,
          centerId: n.centerId ?? null,
          teacherId: n.teacherId ?? null,
          authorUserId: n.author.id,
          body: n.body,
          pinned: n.pinned ?? false,
          status,
          statusChangedById: n.statusChangedBy?.id ?? null,
          statusChangedAt: n.statusChangedBy ? ago(n.minutesAgo - 30) : null,
          createdAt: ago(n.minutesAgo),
        },
      });
      const readerIds = [n.author, ...n.readers].map((p) => p.id);
      await tx.teamNoteRead.createMany({
        data: readerIds.map((userId) => ({ noteId: id, userId })),
        skipDuplicates: true,
      });
    }
  });

  console.log("Seeded. Logins (password:", PASSWORD + "):");
  for (const p of ALL) console.log(`  ${p.role.padEnd(13)} ${email(p)}  (${p.name})`);
  console.log("Boards: /dashboard/admin/notes (Nadia), /dashboard/staff/notes (Heba/Sayed/Afaf), /dashboard/teacher/notes (Fathy), /dashboard/assistant/notes (Dina/Karim)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
