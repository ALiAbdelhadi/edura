import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

import type { NotificationType } from "../src/generated/client";
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;

const did = seedId("edura-preview:");
function flc(userId: string): string {
  return createHash("sha1").update("flc:" + userId).digest("hex").slice(0, 10).toUpperCase();
}
function at(daysFromNow: number, hhmm = "15:00"): Date {
  const d = new Date(Date.now() + daysFromNow * DAY);
  const [h, m] = hhmm.split(":").map(Number);
  d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

type DemoPricingMethod = "whole_room_percent" | "per_attending_student";
const ROOM_METHODS: Record<string, DemoPricingMethod[]> = {
  NILE: ["whole_room_percent", "per_attending_student"],
  ANDL: ["per_attending_student"],
  DEFAULT: ["whole_room_percent"],
};

const ROOM_PROFILES: Record<
  string,
  { capacity: number; price: number; facilities: string[]; photos: string[]; description: string }
> = {
  NILE: {
    capacity: 30,
    price: 60000,
    facilities: ["ac", "smart_board", "projector", "wifi", "seating", "شرفة إطلالة"],
    photos: [
      "https://picsum.photos/seed/nile-room-a/800/450",
      "https://picsum.photos/seed/nile-room-b/800/450",
    ],
    description: "قاعة رئيسية مجهزة بالكامل بالمعادي.",
  },
  ANDL: {
    capacity: 25,
    price: 45000,
    facilities: ["ac", "whiteboard", "projector"],
    photos: ["https://picsum.photos/seed/andl-room/800/450"],
    description: "قاعة واسعة بمدينة نصر.",
  },
  FUTR: {
    capacity: 20,
    price: 40000,
    facilities: ["ac", "whiteboard"],
    photos: ["https://picsum.photos/seed/futr-room/800/450"],
    description: "قاعة بالدقي.",
  },
  DEFAULT: {
    capacity: 30,
    price: 40000,
    facilities: ["ac", "whiteboard"],
    photos: ["https://picsum.photos/seed/room-default/800/450"],
    description: "قاعة تدريس.",
  },
};

type SeedTx = Parameters<Parameters<typeof withPlatformContext>[0]>[0];

async function upsertSplit(
  tx: SeedTx,
  scope: { scope: "center"; centerId: string } | { scope: "room"; roomId: string },
  split: { platformShareBp: number; teacherShareBp: number; centerShareBp: number },
) {
  const where =
    scope.scope === "center"
      ? { scope: "center" as const, centerId: scope.centerId }
      : { scope: "room" as const, roomId: scope.roomId };
  const existing = await tx.commissionSetting.findFirst({ where });
  if (existing) {
    await tx.commissionSetting.update({ where: { id: existing.id }, data: split });
  } else {
    await tx.commissionSetting.create({ data: { ...scope, ...split } });
  }
}

async function upsertM2Rate(
  tx: SeedTx,
  scope: { scope: "center"; centerId: string } | { scope: "room"; roomId: string },
  rate: { centerPerStudentFee: number | null; centerPerStudentBp: number | null },
) {
  const where =
    scope.scope === "center"
      ? { scope: "center" as const, centerId: scope.centerId }
      : { scope: "room" as const, roomId: scope.roomId };
  const existing = await tx.commissionSetting.findFirst({ where });
  if (existing) {
    await tx.commissionSetting.update({ where: { id: existing.id }, data: rate });
  } else {
    await tx.commissionSetting.create({ data: { ...scope, ...rate } });
  }
}

async function purge() {
  await withPlatformContext(
    async (tx) => {
      const demoUsers = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE is_demo = true`;
      const demoCenters = await tx.center.findMany({ where: { isDemo: true }, select: { id: true } });
      const demoCourses = await tx.course.findMany({ where: { isDemo: true }, select: { id: true } });
      const U = demoUsers.map((u) => u.id);
      const C = demoCenters.map((c) => c.id);
      const K = demoCourses.map((c) => c.id);

      const grades = await tx.grade.findMany({ where: { courseId: { in: K } }, select: { id: true } });
      const G = grades.map((g) => g.id);
      await tx.gradeScore.deleteMany({ where: { OR: [{ gradeId: { in: G } }, { studentId: { in: U } }] } });
      await tx.grade.deleteMany({ where: { courseId: { in: K } } });
      await tx.attendanceRecord.deleteMany({ where: { OR: [{ courseId: { in: K } }, { studentId: { in: U } }] } });
      await tx.session.deleteMany({ where: { courseId: { in: K } } });
      await tx.material.deleteMany({ where: { courseId: { in: K } } });
      await tx.review.deleteMany({ where: { OR: [{ studentId: { in: U } }, { teacherId: { in: U } }] } });
      await tx.enrollment.deleteMany({ where: { OR: [{ courseId: { in: K } }, { studentId: { in: U } }] } });
      await tx.enrollmentRequest.deleteMany({ where: { OR: [{ courseId: { in: K } }, { studentId: { in: U } }] } });
      await tx.centerStudentRoster.deleteMany({ where: { OR: [{ centerId: { in: C } }, { studentId: { in: U } }] } });
      await tx.centerTeacherAffiliation.deleteMany({ where: { OR: [{ centerId: { in: C } }, { teacherId: { in: U } }] } });
      await tx.notification.deleteMany({ where: { userId: { in: U } } });
      await tx.parentStudentLink.deleteMany({ where: { OR: [{ parentId: { in: U } }, { studentId: { in: U } }] } });
      await tx.teacherAssistant.deleteMany({ where: { OR: [{ teacherId: { in: U } }, { assistantId: { in: U } }] } });
      await tx.centerStaff.deleteMany({ where: { OR: [{ staffUserId: { in: U } }, { centerId: { in: C } }] } });
      await tx.teacherSubject.deleteMany({ where: { teacherId: { in: U } } });
      await tx.teacherGradeLevel.deleteMany({ where: { teacherId: { in: U } } });
      const demoRoomsForPurge = await tx.room.findMany({
        where: { centerId: { in: C } },
        select: { id: true },
      });
      const R = demoRoomsForPurge.map((r) => r.id);
      await tx.commissionSetting.deleteMany({
        where: {
          OR: [
            { scope: "center", centerId: { in: C } },
            { scope: "room", roomId: { in: R } },
          ],
        },
      });
      await tx.room.deleteMany({ where: { centerId: { in: C } } });
      await tx.centerStage.deleteMany({ where: { centerId: { in: C } } });
      await tx.course.deleteMany({ where: { isDemo: true } });
      await tx.centerAdminProfile.deleteMany({ where: { OR: [{ userId: { in: U } }, { centerId: { in: C } }] } });
      await tx.teacherProfile.deleteMany({ where: { userId: { in: U } } });
      for (const uid of U) {
        await tx.$executeRaw`DELETE FROM wallet_ledger WHERE student_id = ${uid}::uuid`;
      }
      await tx.studentProfile.deleteMany({ where: { userId: { in: U } } });
      await tx.parentProfile.deleteMany({ where: { userId: { in: U } } });
      await tx.userPrefs.deleteMany({ where: { userId: { in: U } } });
      await tx.center.deleteMany({ where: { isDemo: true } });
      const hardDeleted = await tx.$executeRaw`DELETE FROM users WHERE is_demo = true`;

      console.log("Purge complete: removed", {
        users: hardDeleted,
        centers: C.length,
        courses: K.length,
        grades: G.length,
      });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(
    async (tx) => {
      const mkUser = (
        email: string,
        name: string,
        role: "center_admin" | "center_staff" | "teacher" | "assistant" | "student" | "parent",
        status: "active" | "pending" = "active",
      ) =>
        tx.user.upsert({
          where: { email },
          // `deletedAt: null` revives a row the purge soft-deleted — see the
          // same note in seed.ts and the raw hard-delete in purge() below.
          update: { isDemo: true, name, role, status, deletedAt: null },
          create: { email, name, role, status, passwordHash, isDemo: true },
        });

      const centerDefs = [
        { shortId: "NILE", name: "Nile Educational Academy", status: "active", area: "المعادي" },
        { shortId: "ANDL", name: "Al-Andalus Learning Center", status: "active", area: "مدينة نصر" },
        { shortId: "FUTR", name: "Future Scholars Center", status: "active", area: "الدقي" },
        { shortId: "BRGT", name: "Bright Minds Academy", status: "pending", area: "المهندسين" },
      ] as const;
      const centers: Record<string, { id: string }> = {};
      for (const c of centerDefs) {
        const row = await tx.center.upsert({
          where: { shortId: c.shortId },
          update: { isDemo: true, status: c.status },
          create: {
            name: c.name,
            shortId: c.shortId,
            status: c.status,
            subjects: [],
            address: "Cairo, Egypt",
            governorate: "القاهرة",
            area: c.area,
            onboardingCompleted: true,
            isDemo: true,
          },
        });
        centers[c.shortId] = { id: row.id };
        const rp = ROOM_PROFILES[c.shortId] ?? ROOM_PROFILES.DEFAULT!;
        const methods = ROOM_METHODS[c.shortId] ?? ROOM_METHODS.DEFAULT!;
        await tx.room.upsert({
          where: { id: did("room:" + c.shortId) },
          update: {
            capacity: rp.capacity,
            facilities: rp.facilities,
            photos: rp.photos,
            price: rp.price,
            description: rp.description,
            allowedPricingMethods: methods,
          },
          create: {
            id: did("room:" + c.shortId),
            centerId: row.id,
            name: "قاعة 1",
            capacity: rp.capacity,
            facilities: rp.facilities,
            photos: rp.photos,
            price: rp.price,
            description: rp.description,
            allowedPricingMethods: methods,
            isActive: true,
          },
        });
      }
      const nile = centers["NILE"]!;

      // ---- Revenue-split OVERRIDES (config rows, NOT ledger) so the superadmin
      //      screen shows per-center + per-room precedence live. ----
      // ANDL: per-CENTER override — its rooms inherit this (platform 12 / teacher
      // 68 / center 20). NILE: per-ROOM override on قاعة 1 — wins over center &
      // global for that room (platform 20 / teacher 60 / center 20). FUTR/BRGT:
      // no override → inherit the editable global default (15/70/15).
      await upsertSplit(
        tx,
        { scope: "center", centerId: centers["ANDL"]!.id },
        { platformShareBp: 1200, teacherShareBp: 6800, centerShareBp: 2000 },
      );
      await upsertSplit(
        tx,
        { scope: "room", roomId: did("room:NILE") },
        { platformShareBp: 2000, teacherShareBp: 6000, centerShareBp: 2000 },
      );

      // ---- Method-2 per-student RATES (config rows, NOT ledger) so per-student
      //      halls are bookable and the rate editors show precedence live. ----
      // ANDL (per-student-only hall): per-CENTER flat rate 7 EGP/attending student.
      // NILE (both-methods hall): per-ROOM rate 10% of the lesson price/student.
      await upsertM2Rate(
        tx,
        { scope: "center", centerId: centers["ANDL"]!.id },
        { centerPerStudentFee: 700, centerPerStudentBp: null },
      );
      await upsertM2Rate(
        tx,
        { scope: "room", roomId: did("room:NILE") },
        { centerPerStudentFee: null, centerPerStudentBp: 1000 },
      );

      // ---- LOGIN GROUP (reused quick-login demo accounts) ----
      const admin = await mkUser("admin@nile-academy.eg", "Demo Admin", "center_admin");
      await tx.centerAdminProfile.upsert({
        where: { userId: admin.id },
        update: {},
        create: { userId: admin.id, centerId: nile.id },
      });

      // ---- CENTER STAFF (demo, isDemo via mkUser). One per preset role on NILE.
      //      Purely users + center_staff link rows — NO money/ledger/wallet
      //      writes (staff have no wallet), so the "flag roots only / zero money
      //      writes" contract holds. Re-runs re-activate rather than duplicate.
      const staffDefs = [
        { email: "reception@nile-academy.eg", name: "Yasmin Adel", role: "receptionist" as const, title: "Front desk" },
        { email: "manager@nile-academy.eg", name: "Karim Fouad", role: "manager" as const, title: "Operations manager" },
        { email: "accountant@nile-academy.eg", name: "Dalia Sobhy", role: "center_accountant" as const, title: "Center accountant" },
      ];
      for (const s of staffDefs) {
        const staffUser = await mkUser(s.email, s.name, "center_staff");
        await tx.centerStaff.upsert({
          where: { centerId_staffUserId: { centerId: nile.id, staffUserId: staffUser.id } },
          update: { removedAt: null, role: s.role, title: s.title },
          create: { centerId: nile.id, staffUserId: staffUser.id, role: s.role, title: s.title },
        });
      }

      const hossam = await mkUser("hossam.aziz@nile-academy.eg", "Hossam Aziz", "teacher");
      const parent = await mkUser("mona.hassan@email.eg", "Mona Hassan", "parent");
      await tx.parentProfile.upsert({ where: { userId: parent.id }, update: {}, create: { userId: parent.id } });

      const student = await mkUser("lina.hassan@student.nile-academy.eg", "Lina Hassan", "student");
      await tx.studentProfile.upsert({
        where: { userId: student.id },
        update: {},
        create: { userId: student.id, fullName: student.name, familyLinkCode: flc(student.id) },
      });
      // Lina's onboarding: azhari-secondary-3 / علمي. This used to be READ and
      // asserted, on the assumption she had been onboarded through the app —
      // which meant that once a purge removed her profile, the preview seed
      // could never run again ("Lina is not onboarded"). The seed now ESTABLISHES
      // the onboarding it depends on, from the permanent catalog (read-only), so
      // purge -> re-seed is a closed loop. An existing onboarding is respected.
      let lina = await tx.studentProfile.findUnique({ where: { userId: student.id } });
      if (!lina?.gradeLevelId) {
        // The whole chain, so the API's system -> stage -> grade -> track
        // consistency check sees the same shape the onboarding wizard writes.
        const linaGrade = await tx.gradeLevel.findUniqueOrThrow({
          where: { code: "azhari-secondary-3" },
          include: { stage: true },
        });
        const linaTrack = await tx.track.findUniqueOrThrow({ where: { code: "azhari-scientific" } });
        lina = await tx.studentProfile.update({
          where: { userId: student.id },
          data: {
            educationSystemId: linaGrade.stage.educationSystemId,
            stageId: linaGrade.stageId,
            gradeLevelId: linaGrade.id,
            trackId: linaTrack.id,
            onboardingCompleted: true,
          },
        });
      }
      if (!lina.gradeLevelId) {
        throw new Error("preview-seed: could not establish Lina's onboarding (no gradeLevelId).");
      }
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: nile.id, studentId: student.id } },
        update: {},
        create: { centerId: nile.id, studentId: student.id },
      });
      const linkExists = await tx.parentStudentLink.findFirst({ where: { parentId: parent.id, studentId: student.id } });
      if (!linkExists) {
        await tx.parentStudentLink.create({
          data: { parentId: parent.id, studentId: student.id, status: "approved", initiatedBy: "parent" },
        });
      }

      // ---- EXTRA TEACHERS (for a populated superadmin teachers list) ----
      const teacherDefs = [
        { email: "hossam.aziz@nile-academy.eg", name: "Hossam Aziz", mode: "counter_and_door", status: "active", rating: 4.7, exp: 8 },
        { email: "mariam.adel@nile-academy.eg", name: "Mariam Adel", mode: "counter_only", status: "active", rating: 4.9, exp: 12 },
        { email: "khaled.samir@andalus.eg", name: "Khaled Samir", mode: "counter_and_door", status: "active", rating: 4.4, exp: 5 },
        { email: "nour.ibrahim@future.eg", name: "Nour Ibrahim", mode: "counter_only", status: "active", rating: 4.8, exp: 10 },
        { email: "tamer.fouad@preview.edura.eg", name: "Tamer Fouad", mode: "counter_only", status: "pending", rating: 0, exp: 2 },
      ] as const;
      const teachers: { id: string }[] = [];
      for (const td of teacherDefs) {
        const u = await mkUser(td.email, td.name, "teacher", td.status);
        await tx.teacherProfile.upsert({
          where: { userId: u.id },
          update: {
            attendanceMode: td.mode,
            ratingAvg: td.rating,
            ratingCount: td.rating > 0 ? 12 : 0,
            experienceYears: td.exp,
            onboardingCompleted: td.status === "active",
          },
          create: {
            userId: u.id,
            subjects: [],
            attendanceMode: td.mode,
            ratingAvg: td.rating,
            ratingCount: td.rating > 0 ? 12 : 0,
            experienceYears: td.exp,
            onboardingCompleted: td.status === "active",
          },
        });
        teachers.push({ id: u.id });
      }

      // ---- EXTRA STUDENTS (pad the superadmin students count) ----
      const extraStudentDefs = [
        { email: "omar.khaled@student.nile-academy.eg", name: "Omar Khaled" },
        { email: "salma.tarek@student.nile-academy.eg", name: "Salma Tarek" },
        { email: "youssef.adel@student.andalus.eg", name: "Youssef Adel" },
        { email: "hana.sherif@student.future.eg", name: "Hana Sherif" },
      ];
      const extraStudents: { id: string }[] = [];
      for (const sd of extraStudentDefs) {
        const u = await mkUser(sd.email, sd.name, "student");
        await tx.studentProfile.upsert({
          where: { userId: u.id },
          update: {},
          create: { userId: u.id, fullName: sd.name, familyLinkCode: flc(u.id) },
        });
        extraStudents.push({ id: u.id });
      }

      // ---- DEMO WALLETS (is_demo by student ancestry) — balances + running
      //      history for preview. Writes ONLY the wallet subledger + the cached
      //      balance; NO Transaction rows, so the real money ledger stays clean.
      const seedWallet = async (
        studentId: string,
        moves: {
          type: "topup" | "payment" | "refund";
          delta: number;
          method?: "cash" | "online_paymob" | "wallet";
          reason: string;
          daysAgo: number;
        }[],
      ) => {
        // Idempotent re-seed: clear prior rows (raw — immutability blocks delete).
        await tx.$executeRaw`DELETE FROM wallet_ledger WHERE student_id = ${studentId}::uuid`;
        let bal = 0;
        for (const m of moves) {
          bal += m.delta;
          await tx.walletLedger.create({
            data: {
              studentId,
              type: m.type,
              delta: m.delta,
              balanceAfter: bal, // running balance reconciles to walletBalance below
              method: m.method ?? null,
              reason: m.reason,
              createdAt: at(-m.daysAgo),
            },
          });
        }
        await tx.studentProfile.update({
          where: { userId: studentId },
          data: { walletBalance: bal },
        });
      };
      await seedWallet(student.id, [
        { type: "topup", delta: 30000, method: "online_paymob", reason: "Online top-up", daysAgo: 20 },
        { type: "payment", delta: -8000, method: "wallet", reason: "Subscription payment", daysAgo: 12 },
        { type: "topup", delta: 10000, method: "cash", reason: "Cash top-up at center", daysAgo: 5 },
        { type: "refund", delta: 8000, reason: "Refund to wallet", daysAgo: 2 },
      ]); // final 40000 (400 EGP)
      await seedWallet(extraStudents[0]!.id, [
        { type: "topup", delta: 15000, method: "cash", reason: "Cash top-up at center", daysAgo: 10 },
        { type: "payment", delta: -5000, method: "wallet", reason: "Session pass", daysAgo: 3 },
      ]); // final 10000
      await seedWallet(extraStudents[1]!.id, [
        { type: "topup", delta: 20000, method: "online_paymob", reason: "Online top-up", daysAgo: 7 },
      ]); // final 20000

      // ---- SUBJECTS from Lina's real track offerings (read-only catalog) ----
      const offerings = await tx.subjectOffering.findMany({
        where: {
          gradeLevelId: lina.gradeLevelId,
          isActive: true,
          OR: [{ trackId: lina.trackId }, { trackId: null }],
        },
        // Deterministic pick + round-robin: without an orderBy the teacher ↔
        // subject pairing (courses AND TeacherSubject below) shuffles between
        // seed runs.
        orderBy: { subjectId: "asc" },
        take: 4,
      });
      const subjectIds = offerings.map((o) => o.subjectId);
      const subjects = await tx.subject.findMany({ where: { id: { in: subjectIds } } });
      const subjById = new Map(subjects.map((s) => [s.id, s]));
      const subjName = (id: string) => {
        const s = subjById.get(id) as Record<string, unknown> | undefined;
        return (s?.nameAr as string) || (s?.nameEn as string) || (s?.name as string) || (s?.code as string) || "مادة";
      };

      // ---- COURSES (root, isDemo) matched to Lina's grade + track ----
      const courseTeachers = [teachers[0]!, teachers[1]!, teachers[2]!, teachers[3]!];
      const courseCenters = [nile, centers["ANDL"]!, centers["FUTR"]!, nile];
      const courses: { id: string; centerId: string; teacherId: string }[] = [];
      for (let i = 0; i < offerings.length; i++) {
        const off = offerings[i]!;
        const t = courseTeachers[i % courseTeachers.length]!;
        const ctr = courseCenters[i % courseCenters.length]!;
        const id = did("course:" + off.subjectId + ":" + lina.gradeLevelId);
        const name = subjName(off.subjectId);
        // NILE demo courses are ROOM-BASED (book قاعة 1) → they carry the frozen
        // Method-1 snapshot = the NILE room override (20/60/20). Config only,
        // no ledger. Other centers' demo courses stay no-room (legacy).
        const roomBased =
          ctr.id === nile.id
            ? {
              defaultRoomId: did("room:NILE"),
              pricingMethod: "whole_room_percent" as const,
              splitPlatformBp: 2000,
              splitTeacherBp: 6000,
              splitCenterBp: 2000,
            }
            : {};
        await tx.course.upsert({
          where: { id },
          update: {
            isDemo: true,
            status: "active",
            subjectId: off.subjectId,
            gradeLevelId: lina.gradeLevelId,
            trackId: lina.trackId,
            // Both plans enabled (approved decision #2 requires at least one).
            // Without pricePerSession the seeded course cannot demonstrate the
            // classic counter workflow at all — walk-in cash answers 422
            // "Per-session plan is not enabled" and check-in stays 402 forever.
            // CONFIG on a demo course; not a ledger row.
            pricePerMonth: 40000,
            pricePerSession: 5000,
            ...roomBased,
          },
          create: {
            id,
            centerId: ctr.id,
            teacherId: t.id,
            title: `${name} — الثالث الثانوي`,
            subject: name,
            subjectId: off.subjectId,
            gradeLevelId: lina.gradeLevelId,
            trackId: lina.trackId,
            daysOfWeek: [6, 1, 3],
            startTime: "16:00",
            endTime: "18:00",
            startDate: at(-30),
            price: 40000, // piasters — course CONFIG (display), not a ledger row
            pricePerMonth: 40000,
            pricePerSession: 5000,
            maxStudents: 30,
            status: "active",
            isDemo: true,
            ...roomBased,
          },
        });
        courses.push({ id, centerId: ctr.id, teacherId: t.id });
        // Teacher subject/grade links (so teachers have subjects; optional but tidy)
        await tx.teacherSubject.upsert({
          where: { teacherId_subjectId: { teacherId: t.id, subjectId: off.subjectId } },
          update: {},
          create: { teacherId: t.id, subjectId: off.subjectId },
        });
        await tx.teacherGradeLevel.upsert({
          where: { teacherId_gradeLevelId: { teacherId: t.id, gradeLevelId: lina.gradeLevelId } },
          update: {},
          create: { teacherId: t.id, gradeLevelId: lina.gradeLevelId },
        });
        // Active affiliation of the teacher to the course's center
        const aff = await tx.centerTeacherAffiliation.findFirst({ where: { centerId: ctr.id, teacherId: t.id } });
        if (!aff) {
          await tx.centerTeacherAffiliation.create({
            data: {
              centerId: ctr.id,
              teacherId: t.id,
              status: "active",
              respondedAt: new Date(),
              expiresAt: at(365),
            },
          });
        }
      }
      if (courses.length === 0) throw new Error("No subject offerings found for Lina's grade/track.");

      // ---- METHOD-2 DEMO COURSE (per-attending-student) on ANDL's forced hall.
      //      Frozen snapshot: platform 12% (ANDL center split) + 7 EGP/attending
      //      student (ANDL center rate). CONFIG + roster only — NO ledger rows;
      //      sessions settle only if Ali completes one from the UI. ----
      {
        const off0 = offerings[0]!;
        const m2Teacher = teachers[1]!;
        const m2Id = did("course:m2:" + off0.subjectId);
        await tx.course.upsert({
          where: { id: m2Id },
          update: {
            isDemo: true,
            status: "active",
            defaultRoomId: did("room:ANDL"),
            pricingMethod: "per_attending_student",
            splitPlatformBp: 1200,
            m2CenterFee: 700,
            m2CenterBp: null,
          },
          create: {
            id: m2Id,
            centerId: centers["ANDL"]!.id,
            teacherId: m2Teacher.id,
            title: `${subjName(off0.subjectId)} — قاعة بالطالب (تجريبي)`,
            subject: subjName(off0.subjectId),
            subjectId: off0.subjectId,
            gradeLevelId: lina.gradeLevelId,
            trackId: lina.trackId,
            defaultRoomId: did("room:ANDL"),
            daysOfWeek: [0, 2],
            startTime: "18:00",
            endTime: "20:00",
            startDate: at(-14),
            price: 30000, // piasters — config/display only, never a ledger row
            pricePerMonth: 30000,
            pricePerSession: 4000,
            maxStudents: 25,
            status: "active",
            isDemo: true,
            pricingMethod: "per_attending_student",
            splitPlatformBp: 1200,
            m2CenterFee: 700,
            m2CenterBp: null,
          },
        });
        // Mirror the course subject into the teacher's specialization — the
        // main loop only does this for the round-robin teacher, so without it
        // the M2 teacher gets a class whose subject the specialization-scoped
        // pickers (collaboration dialog) never show.
        await tx.teacherSubject.upsert({
          where: { teacherId_subjectId: { teacherId: m2Teacher.id, subjectId: off0.subjectId } },
          update: {},
          create: { teacherId: m2Teacher.id, subjectId: off0.subjectId },
        });
        courses.push({ id: m2Id, centerId: centers["ANDL"]!.id, teacherId: m2Teacher.id });
      }

      // ---- ENROLLMENTS (roster links — NO money) ----
      const enroll = async (studentId: string, courseId: string, centerId: string) => {
        const ex = await tx.enrollment.findFirst({ where: { studentId, courseId } });
        if (!ex) {
          await tx.enrollment.create({
            data: { studentId, courseId, centerId, status: "active", enrolledBy: admin.id },
          });
        } else if (ex.status !== "active") {
          await tx.enrollment.update({ where: { id: ex.id }, data: { status: "active", unenrolledAt: null } });
        }
      };
      for (const c of courses) await enroll(student.id, c.id, c.centerId);
      // a couple extra students on the first course (enrollment counts)
      await enroll(extraStudents[0]!.id, courses[0]!.id, courses[0]!.centerId);
      await enroll(extraStudents[1]!.id, courses[0]!.id, courses[0]!.centerId);

      // ---- SESSIONS (schedule) — courses[0] gets a full week, others lighter ----
      const c0 = courses[0]!;
      const sessionPlan: { key: string; days: number; status: "scheduled" | "completed" }[] = [
        { key: "s-today", days: 0, status: "scheduled" },
        { key: "s+3", days: 3, status: "scheduled" },
        { key: "s-3", days: -3, status: "completed" },
        { key: "s-7", days: -7, status: "completed" },
        { key: "s-14", days: -14, status: "completed" },
        { key: "s-21", days: -21, status: "completed" },
      ];
      const c0Sessions: { id: string; days: number; status: string }[] = [];
      for (const sp of sessionPlan) {
        const id = did("sess:" + c0.id + ":" + sp.key);
        await tx.session.upsert({
          where: { id },
          update: { status: sp.status },
          create: {
            id,
            courseId: c0.id,
            teacherId: c0.teacherId,
            originalDate: at(sp.days),
            date: at(sp.days),
            startTime: "16:00",
            endTime: "18:00",
            status: sp.status,
            roomId: did("room:NILE"),
          },
        });
        c0Sessions.push({ id, days: sp.days, status: sp.status });
      }
      // one upcoming session on courses[1] so "today/upcoming" spans subjects
      if (courses[1]) {
        const id = did("sess:" + courses[1].id + ":s+1");
        await tx.session.upsert({
          where: { id },
          update: { status: "scheduled" },
          create: {
            id,
            courseId: courses[1].id,
            teacherId: courses[1].teacherId,
            originalDate: at(1),
            date: at(1),
            startTime: "18:00",
            endTime: "20:00",
            status: "scheduled",
          },
        });
      }

      // ---- ATTENDANCE (Lina: 4 present + 1 absent over past sessions) ----
      const past = c0Sessions.filter((s) => s.days < 0).sort((a, b) => a.days - b.days); // oldest..newest
      const attStatuses = ["present", "present", "present", "absent"] as const; // -21,-14,-7,-3
      for (let i = 0; i < past.length; i++) {
        const st = attStatuses[i] ?? "present";
        await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: past[i]!.id, studentId: student.id } },
          update: { status: st },
          create: {
            sessionId: past[i]!.id,
            studentId: student.id,
            courseId: c0.id,
            centerId: c0.centerId,
            status: st,
            markedBy: admin.id,
          },
        });
      }

      // ---- GRADES — grade EVERY enrolled course (good scores) so the
      // dashboard's subject-performance + average-grade read realistically,
      // plus one PENDING assignment on c0 (drives "assignments due" / dueSoon).
      // centerId is REQUIRED on grades. NO money is written.
      const gradeName = ["اختبار الوحدة الأولى", "امتحان منتصف الفصل", "اختبار قصير", "الامتحان الشهري", "تقييم مستمر"];
      const gradeMax = [20, 50, 30, 25, 40];
      const gradeGot = [17, 44, 27, 23, 35]; // ~85–92%
      // Grade EVERY course Lina is actively enrolled in (incl. any pre-existing
      // course from the base seed) so no subject shows 0% / F.
      const linaEnrollments = await tx.enrollment.findMany({
        where: { studentId: student.id, status: "active" },
        select: { courseId: true },
      });
      const enrolledIds = [...new Set(linaEnrollments.map((e) => e.courseId))];
      const enrolledCourses = await tx.course.findMany({
        where: { id: { in: enrolledIds } },
        select: { id: true, centerId: true, teacherId: true },
      });
      let gi = 0;
      for (const c of enrolledCourses) {
        if (!c.centerId) continue; // grades require a center (teacher-direct can't carry grades)
        const gid = did("grade:" + c.id + ":main");
        await tx.grade.upsert({
          where: { id: gid },
          update: {},
          create: {
            id: gid,
            courseId: c.id,
            centerId: c.centerId,
            teacherId: c.teacherId,
            name: gradeName[gi % gradeName.length]!,
            maxScore: gradeMax[gi % gradeMax.length]!,
            date: at(-12 - gi * 3),
            gradeType: "numeric",
          },
        });
        await tx.gradeScore.upsert({
          where: { gradeId_studentId: { gradeId: gid, studentId: student.id } },
          update: { score: gradeGot[gi % gradeGot.length]! },
          create: { gradeId: gid, studentId: student.id, score: gradeGot[gi % gradeGot.length]! },
        });
        gi++;
      }
      const gradePending = did("grade:" + c0.id + ":hw2");
      await tx.grade.upsert({
        where: { id: gradePending },
        update: {},
        create: {
          id: gradePending,
          courseId: c0.id,
          centerId: c0.centerId,
          teacherId: c0.teacherId,
          name: "واجب الفصل الثاني",
          maxScore: 10,
          date: at(-4),
          gradeType: "numeric",
        },
      });

      // ---- MATERIALS (centerId REQUIRED) ----
      const materialDefs = [
        { c: c0, key: "m1", title: "مذكرة الوحدة الأولى", type: "lecture" },
        { c: c0, key: "m2", title: "ورقة عمل — تمارين محلولة", type: "homework" },
        { c: courses[1] ?? c0, key: "m3", title: "ملخص منتصف الفصل", type: "lecture" },
        { c: courses[2] ?? c0, key: "m4", title: "نموذج امتحان تجريبي", type: "exam" },
      ] as const;
      for (const md of materialDefs) {
        const id = did("mat:" + md.c.id + ":" + md.key);
        await tx.material.upsert({
          where: { id },
          update: {},
          create: {
            id,
            courseId: md.c.id,
            centerId: md.c.centerId,
            teacherId: md.c.teacherId,
            title: md.title,
            type: md.type,
            storageProvider: "external",
            externalUrl: "https://example.com/preview.pdf",
          },
        });
      }

      // ---- NOTIFICATIONS (display only; non-money types) ----
      const notify = async (
        userId: string,
        key: string,
        type: NotificationType,
        title: string,
        body: string,
        read: boolean,
      ) => {
        await tx.notification.upsert({
          where: { id: did("notif:" + userId + ":" + key) },
          update: {},
          create: { id: did("notif:" + userId + ":" + key), userId, type, title, body, read, status: "sent" },
        });
      };
      await notify(student.id, "n1", "grade_entered", "تم رصد درجة جديدة", "درجة اختبار الوحدة الأولى: 17 / 20", false);
      await notify(student.id, "n2", "material_uploaded", "مادة تعليمية جديدة", "تم رفع: مذكرة الوحدة الأولى", false);
      await notify(student.id, "n3", "lesson_reminder", "تذكير بالحصة", "لديك حصة اليوم الساعة 4 عصرًا", true);
      await notify(student.id, "n4", "session_postponed", "تم تأجيل حصة", "تم تأجيل حصة الغد إلى نفس الموعد الأسبوع القادم", true);
      await notify(student.id, "n5", "admin_broadcast", "إعلان من الإدارة", "أهلًا بك في المنصة — تصفّح موادك وجدولك.", true);
      await notify(hossam.id, "n1", "student_added_to_roster", "طالب جديد", "انضم طالب جديد إلى مجموعتك", false);
      await notify(hossam.id, "n2", "material_uploaded", "تم رفع مادة", "تم نشر مذكرة الوحدة الأولى", true);
      await notify(hossam.id, "n3", "admin_broadcast", "إعلان", "تذكير باجتماع المدرّسين الأسبوعي", true);
      await notify(admin.id, "n1", "enrollment_request_submitted", "طلب تسجيل جديد", "طلب انضمام بانتظار المراجعة", false);
      await notify(admin.id, "n2", "admin_broadcast", "إعلان", "تقرير الحضور الأسبوعي جاهز", true);
      await notify(parent.id, "n1", "grade_entered", "درجة جديدة لابنتك", "لينا حصلت على 17 / 20 في اختبار الوحدة الأولى", false);
      await notify(parent.id, "n2", "admin_broadcast", "إعلان", "موعد اجتماع أولياء الأمور الأسبوع القادم", true);

      // ---- REVIEW (rating 1..5) ----
      // NOT an upsert: `Review` deliberately has no `@@unique([studentId,
      // teacherId])` any more. Uniqueness moved into two PARTIAL indexes
      // (migration 20260818120000_review_per_lesson_unique) because a plain
      // compound unique made `lessonId` unusable — the second lesson a student
      // rated collided with the first. Prisma cannot express a `WHERE` on a
      // unique index, so `studentId_teacherId` no longer exists as a key and
      // the old upsert threw `Unknown argument studentId_teacherId`, taking the
      // whole preview seed down with it.
      //
      // Idempotency is therefore application-level, matching exactly what
      // services/reviews/reviews.ts does: an OVERALL review is the row with
      // `lessonId: null`.
      const existingReview = await tx.review.findFirst({
        where: { studentId: student.id, teacherId: hossam.id, lessonId: null },
        select: { id: true },
      });
      if (existingReview) {
        await tx.review.update({ where: { id: existingReview.id }, data: { rating: 5 } });
      } else {
        await tx.review.create({
          data: {
            studentId: student.id,
            teacherId: hossam.id,
            centerId: nile.id,
            lessonId: null,
            rating: 5,
            text: "شرح ممتاز ومبسّط، جزاه الله خيرًا.",
          },
        });
      }

      console.log("Preview seed complete:", {
        centers: centerDefs.map((c) => c.shortId),
        teachers: teacherDefs.length,
        students: 1 + extraStudentDefs.length,
        courses: courses.length,
        sessions: c0Sessions.length + (courses[1] ? 1 : 0),
        loginPassword: PASSWORD === "Passw0rd!" ? "Passw0rd! (default)" : "(SEED_PASSWORD)",
      });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

async function main() {
  // Demo data must never reach production — in either direction. The purge path
  // is guarded too: it deletes every is_demo row it finds, which is correct on a
  // dev database and unacceptable as a stray command against production.
  await assertNotProduction("preview-seed");

  if (PURGE) {
    console.log("PURGE mode — removing all is_demo preview data…");
    await purge();
  } else {
    await seed();
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(PURGE ? "Purge failed:" : "Preview seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
