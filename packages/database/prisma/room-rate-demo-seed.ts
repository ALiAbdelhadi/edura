import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role, RoomPricingMethod } from "../src/generated/client/index";
import { withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-roomratedemo:");

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({
  id: did(key),
  key,
  name,
  role,
});


const OFOK_OWNER = P("ofok-owner", "منى الشاذلي", "center_admin");
const NOKHBA_OWNER = P("nokhba-owner", "شريف الجندي", "center_admin");
const TEACHER = P("teacher", "أ. طارق منصور", "teacher");
const ALL = [OFOK_OWNER, NOKHBA_OWNER, TEACHER];

const email = (p: Person) => `roomratedemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const OFOK = { id: did("center:ofok"), shortId: "RATEDEMO01", name: "سنتر الأفق" };
const NOKHBA = { id: did("center:nokhba"), shortId: "RATEDEMO02", name: "سنتر النخبة" };
const CENTERS = [OFOK, NOKHBA];

const FALLBACK_GLOBAL_BP = 1500;
const NOKHBA_CENTER_BP = 1000;

type HallSpec = {
  key: string;
  center: (typeof CENTERS)[number];
  name: string;
  capacity: number;
  price: number | null; 
  facilities: string[];
  methods: RoomPricingMethod[];
  ownBp: number | null;
  description: string;
};

const HALLS: HallSpec[] = [
  {
    key: "ofok-1",
    center: OFOK,
    name: "قاعة الأفق ١",
    capacity: 30,
    price: 60_000,
    facilities: ["ac", "whiteboard", "projector"],
    methods: ["whole_room_percent", "per_attending_student"],
    ownBp: 800,
    description: "قاعة واسعة بإضاءة طبيعية — مناسبة للمجموعات الكبيرة.",
  },
  {
    key: "ofok-2",
    center: OFOK,
    name: "قاعة الأفق ٢",
    capacity: 18,
    price: 35_000,
    facilities: ["ac", "whiteboard"],
    methods: ["per_attending_student"],
    ownBp: null,
    description: "قاعة صغيرة للمجموعات المكثفة — الحساب بعدد الحاضرين.",
  },
  {
    key: "ofok-3",
    center: OFOK,
    name: "قاعة الأفق ٣",
    capacity: 45,
    price: 90_000,
    facilities: ["ac", "smart_board", "speakers", "wifi"],
    methods: ["whole_room_percent"],
    ownBp: null, 
    description: "المدرّج الكبير — سبورة ذكية ونظام صوت.",
  },
  {
    key: "ofok-4",
    center: OFOK,
    name: "قاعة الأفق ٤",
    capacity: 24,
    price: 50_000,
    facilities: ["whiteboard", "seating"],
    methods: ["whole_room_percent", "per_attending_student"],
    ownBp: null,
    description: "قاعة متوسطة بمقاعد مريحة.",
  },
  {
    key: "nokhba-1",
    center: NOKHBA,
    name: "قاعة النخبة ١",
    capacity: 20,
    price: 45_000,
    facilities: ["ac", "projector", "wifi"],
    methods: ["whole_room_percent", "per_attending_student"],
    ownBp: 600, 
    description: "قاعة مجهزة بالكامل للمراجعات النهائية.",
  },
  {
    key: "nokhba-2",
    center: NOKHBA,
    name: "قاعة النخبة ٢",
    capacity: 16,
    price: null,
    facilities: ["whiteboard"],
    methods: ["per_attending_student"],
    ownBp: null,
    description: "قاعة صغيرة — الحساب بعدد الحاضرين.",
  },
];

const hallId = (h: HallSpec) => did(`room:${h.key}`);

async function purge() {
  console.log("Purging room-rate demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: {
        OR: [
          { shortId: { in: CENTERS.map((c) => c.shortId) } },
          { id: { in: CENTERS.map((c) => c.id) } },
        ],
      },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);
    const rooms = await tx.room.findMany({
      where: { centerId: { in: centerIds } },
      select: { id: true },
    });
    const roomIds = rooms.map((r) => r.id);
    const config = await tx.commissionSetting.deleteMany({
      where: {
        OR: [
          { scope: "center", centerId: { in: centerIds } },
          { scope: "room", roomId: { in: roomIds } },
        ],
      },
    });
    await tx.room.deleteMany({ where: { id: { in: roomIds } } });
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
      rooms: roomIds.length,
      configRows: config.count,
    });
  });
  console.log("Purged.");
}

async function main() {
  await assertNotProduction("room-rate-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding room-rate demo…");

  await withPlatformContext(async (tx) => {
    // THIS SEED WRITES NOTHING AT GLOBAL SCOPE (docs/follow-ups.md #12).
    //
    // It used to create the `global` commission_settings row, and — worse —
    // fill in `center_per_student_bp` on an EXISTING one when that column was
    // null. That row is platform money configuration, not demo data: it carries
    // no `is_demo` flag, so no purge reverses it, and `hall-booking` A4 asserts
    // a refusal that only holds while that value is ABSENT, so running this
    // seed turned an unrelated suite red for reasons nobody could see.
    //
    // The resolution chain is teacher > center > global, so when the platform
    // has no cap the demo gives its OWN centre one instead. Same effective
    // number for the demo, and `purge()` already deletes every
    // `scope: "center"` row belonging to these centres.
    const globalRow = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
    const globalRate = globalRow
      ? { fee: globalRow.centerPerStudentFee, bp: globalRow.centerPerStudentBp }
      : null;
    const platformHasCap = globalRate != null && (globalRate.fee != null || globalRate.bp != null);

    // Set only when the platform has no cap of its own — then OFOK carries one.
    const ofokOwnCapBp = platformHasCap ? null : FALLBACK_GLOBAL_BP;

    if (platformHasCap) {
      console.log(
        `  · kept YOUR global cap, untouched: ${
          globalRate!.bp != null ? `${globalRate!.bp / 100}%` : `${globalRate!.fee! / 100} EGP`
        }`,
      );
    } else {
      console.log(
        `  · the platform has no per-student cap — leaving the global row alone and giving\n` +
          `    ${OFOK.name} its own centre cap (${FALLBACK_GLOBAL_BP / 100}%) for the demo`,
      );
    }

    const capBp = platformHasCap ? globalRate!.bp : ofokOwnCapBp;
    if (capBp == null) {
      console.warn(
        "  ! your global cap is a FLAT amount, so the halls below are seeded with no own rate\n" +
          "    (a hall must quote in the platform's form). Switch the global rate to a percentage\n" +
          "    to see the center-set-rate states.",
      );
    }
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
    await tx.teacherProfile.upsert({
      where: { userId: TEACHER.id },
      update: { onboardingCompleted: true },
      create: {
        userId: TEACHER.id,
        walletBalance: 0,
        onboardingCompleted: true,
        lessonPrice: 15_000,
      },
    });

    for (const [center, owner] of [
      [OFOK, OFOK_OWNER],
      [NOKHBA, NOKHBA_OWNER],
    ] as const) {
      await tx.center.upsert({
        where: { id: center.id },
        update: { isDemo: true, status: "active", onboardingCompleted: true },
        create: {
          id: center.id,
          name: center.name,
          shortId: center.shortId,
          status: "active",
          ownerUserId: owner.id,
          isDemo: true,
          onboardingCompleted: true,
          governorate: "القاهرة",
          area: "مدينة نصر",
          phone: "01000000000",
        },
      });
      await tx.centerAdminProfile.upsert({
        where: { userId: owner.id },
        update: { centerId: center.id },
        create: { userId: owner.id, centerId: center.id },
      });
    }

    // OFOK normally inherits the platform cap; it only gets a row of its own
    // when there is no platform cap to inherit (see above).
    if (ofokOwnCapBp != null) {
      const existingOfokRow = await tx.commissionSetting.findFirst({
        where: { scope: "center", centerId: OFOK.id },
      });
      if (existingOfokRow) {
        await tx.commissionSetting.update({
          where: { id: existingOfokRow.id },
          data: { centerPerStudentFee: null, centerPerStudentBp: ofokOwnCapBp },
        });
      } else {
        await tx.commissionSetting.create({
          data: { scope: "center", centerId: OFOK.id, centerPerStudentBp: ofokOwnCapBp },
        });
      }
    }

    const nokhbaCap = capBp == null ? null : Math.min(NOKHBA_CENTER_BP, capBp);
    const existingCenterRow = await tx.commissionSetting.findFirst({
      where: { scope: "center", centerId: NOKHBA.id },
    });
    if (nokhbaCap != null) {
      if (existingCenterRow) {
        await tx.commissionSetting.update({
          where: { id: existingCenterRow.id },
          data: { centerPerStudentFee: null, centerPerStudentBp: nokhbaCap },
        });
      } else {
        await tx.commissionSetting.create({
          data: { scope: "center", centerId: NOKHBA.id, centerPerStudentBp: nokhbaCap },
        });
      }
    }

    for (const h of HALLS) {
      const id = hallId(h);
      await tx.room.upsert({
        where: { id },
        update: {
          name: h.name,
          capacity: h.capacity,
          price: h.price,
          facilities: h.facilities,
          description: h.description,
          allowedPricingMethods: h.methods,
          isActive: true,
        },
        create: {
          id,
          centerId: h.center.id,
          name: h.name,
          capacity: h.capacity,
          price: h.price,
          facilities: h.facilities,
          description: h.description,
          allowedPricingMethods: h.methods,
          isActive: true,
        },
      });

      const capForHall = h.center.id === NOKHBA.id ? (nokhbaCap ?? capBp) : capBp;
      const wanted = h.key === "ofok-4" ? capForHall : h.ownBp;
      const own =
        wanted == null || capForHall == null ? null : Math.min(wanted, capForHall);

      const existingRoomRow = await tx.commissionSetting.findFirst({
        where: { scope: "room", roomId: id },
      });
      if (own == null) {
        if (existingRoomRow) {
          await tx.commissionSetting.delete({ where: { id: existingRoomRow.id } });
        }
      } else if (existingRoomRow) {
        await tx.commissionSetting.update({
          where: { id: existingRoomRow.id },
          data: { centerPerStudentFee: null, centerPerStudentBp: own },
        });
      } else {
        await tx.commissionSetting.create({
          data: { scope: "room", roomId: id, centerPerStudentBp: own },
        });
      }

      const shows = !h.methods.includes("per_attending_student")
        ? "—"
        : own != null
          ? `${own / 100}% (own)`
          : capForHall != null
            ? `${capForHall / 100}% (inherited)`
            : "unavailable";
      console.log(`  · ${h.name.padEnd(14)} ${h.methods.join("+").padEnd(38)} ${shows}`);
    }
  });

  console.log("\nDone. Log in with password:", PASSWORD);
  console.log("  center «سنتر الأفق»  :", email(OFOK_OWNER));
  console.log("  center «سنتر النخبة» :", email(NOKHBA_OWNER));
  console.log("  teacher              :", email(TEACHER));
  console.log(
    "\nCenter side : /dashboard/admin/rooms → Add/Edit a hall → tick «لكل طالب حاضر»\n" +
      "Teacher side: /dashboard/teacher/centers → «قدّم للتدريس في سنتر» → pick a center",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
