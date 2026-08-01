/* eslint-disable no-console */
/**
 * ============================================================================
 * ROOM RATE DEMO SEED — throwaway is_demo data for previewing the per-
 * attending-student hall pricing (center-set + capped, approved 2026-08-01).
 * ============================================================================
 * Builds TWO centers whose halls cover every state the feature can be in, so
 * both screens render populated and every rule is visible without setting
 * anything up by hand:
 *
 *   «سنتر الأفق» — NO center-level rate, so its halls are capped by the
 *                  PLATFORM's rate (the global row):
 *     قاعة الأفق ١  both methods · own rate UNDER the cap      → priced itself
 *     قاعة الأفق ٢  per-student ONLY · no own rate             → inherits; and
 *                                                                the teacher
 *                                                                sees no hall
 *                                                                price, only
 *                                                                the rate
 *     قاعة الأفق ٣  whole-room % ONLY                          → no rate field
 *     قاعة الأفق ٤  both methods · own rate exactly AT the cap → the boundary
 *
 *   «سنتر النخبة» — HAS a center-level rate, which becomes the cap for its own
 *                   halls instead of the global one (center > global):
 *     قاعة النخبة ١  own rate under the CENTER's cap
 *     قاعة النخبة ٢  inherits the center's rate
 *
 * Log in as either center owner to edit halls, or as the teacher to see what a
 * hall costs per attending student while picking one.
 *
 * SAFETY (same contract as the other demo seeds):
 *   • Every ROOT entity (User / Center) is flagged isDemo = true; rooms inherit
 *     demo-ness by ancestry (decision #6).
 *   • ZERO writes to any money / ledger / wallet / payment table. The rows this
 *     writes to commission_settings are CONFIG, exactly like preview-seed.ts —
 *     and only ever `center`/`room` scope rows belonging to the demo centers.
 *   • The GLOBAL rate is the platform's own config, NOT demo data: it is
 *     created ONLY if missing (so a fresh DB has a cap to demo against) and
 *     NEVER overwritten if you already set one. The purge leaves it alone.
 *   • The permanent Egyptian catalog is READ, never written.
 *   • Real staff accounts are never touched.
 *
 * Idempotent: deterministic ids, re-run safely.
 *
 *   Seed:  bun run seed:roomrate-demo
 *   Purge: bun run seed:roomrate-demo -- --purge
 * ============================================================================
 */
import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";
import type { Role, RoomPricingMethod } from "../src/generated/client/index";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

// Deterministic UUIDv5 via the shared generator (H-03: never hand-rolled).
const did = seedId("edura-roomratedemo:");

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({
  id: did(key),
  key,
  name,
  role,
});

// ---- the cast --------------------------------------------------------------
const OFOK_OWNER = P("ofok-owner", "منى الشاذلي", "center_admin");
const NOKHBA_OWNER = P("nokhba-owner", "شريف الجندي", "center_admin");
const TEACHER = P("teacher", "أ. طارق منصور", "teacher");
const ALL = [OFOK_OWNER, NOKHBA_OWNER, TEACHER];

// Natural keys — stable across any id-formula change (H-03 purge lesson).
const email = (p: Person) => `roomratedemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const OFOK = { id: did("center:ofok"), shortId: "RATEDEMO01", name: "سنتر الأفق" };
const NOKHBA = { id: did("center:nokhba"), shortId: "RATEDEMO02", name: "سنتر النخبة" };
const CENTERS = [OFOK, NOKHBA];

// The platform's cap, used only when the global row does not carry one yet.
const FALLBACK_GLOBAL_BP = 1500; // 15% of the lesson price per attending student
const NOKHBA_CENTER_BP = 1000; // this center's own cap for its halls: 10%

type HallSpec = {
  key: string;
  center: (typeof CENTERS)[number];
  name: string;
  capacity: number;
  price: number | null; // piasters — the whole-room hall price
  facilities: string[];
  methods: RoomPricingMethod[];
  /** The hall's OWN per-student rate in basis points, or null to inherit. */
  ownBp: number | null;
  description: string;
};

const HALLS: HallSpec[] = [
  {
    key: "ofok-1",
    center: OFOK,
    name: "قاعة الأفق ١",
    capacity: 30,
    price: 60_000, // 600 EGP
    facilities: ["ac", "whiteboard", "projector"],
    methods: ["whole_room_percent", "per_attending_student"],
    ownBp: 800, // 8% — the hall priced itself UNDER the platform cap
    description: "قاعة واسعة بإضاءة طبيعية — مناسبة للمجموعات الكبيرة.",
  },
  {
    key: "ofok-2",
    center: OFOK,
    name: "قاعة الأفق ٢",
    capacity: 18,
    price: 35_000, // deliberately set: the teacher must NOT see it (per-student only)
    facilities: ["ac", "whiteboard"],
    methods: ["per_attending_student"],
    ownBp: null, // inherits the platform's rate
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
    ownBp: null, // no per-student method at all → no rate involved
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
    ownBp: null, // filled in at seed time with the resolved cap (the boundary)
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
    ownBp: 600, // 6% — under this CENTER's 10% cap
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
    ownBp: null, // inherits the CENTER's 10%, not the global 15%
    description: "قاعة صغيرة — الحساب بعدد الحاضرين.",
  },
];

const hallId = (h: HallSpec) => did(`room:${h.key}`);

async function purge() {
  console.log("Purging room-rate demo data…");
  await withPlatformContext(async (tx) => {
    // Resolve by NATURAL keys, not derived ids (see messaging-demo-seed purge).
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

    // Config rows for THESE centers/halls only — the global row is the
    // platform's and is deliberately left untouched.
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
    // Raw hard delete: user.deleteMany is soft-delete-intercepted and would
    // leave the UNIQUE emails behind (P2002 on the next run).
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
    // ---- the platform cap -------------------------------------------------
    // NOT demo data: only created when missing, never overwritten. Without a
    // published rate the feature is legitimately unavailable and the demo
    // would show nothing but the disabled state.
    const globalRow = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
    let globalRate = globalRow
      ? { fee: globalRow.centerPerStudentFee, bp: globalRow.centerPerStudentBp }
      : null;

    if (!globalRow) {
      await tx.commissionSetting.create({
        data: {
          scope: "global",
          teacherDirectCommissionBp: 1500,
          platformTeacherFee: 200,
          platformCenterFee: 200,
          platformShareBp: 1500,
          teacherShareBp: 7000,
          centerShareBp: 1500,
          centerPerStudentBp: FALLBACK_GLOBAL_BP,
        },
      });
      globalRate = { fee: null, bp: FALLBACK_GLOBAL_BP };
      console.log(`  · created the global config row (cap ${FALLBACK_GLOBAL_BP / 100}%)`);
    } else if (globalRate!.fee == null && globalRate!.bp == null) {
      await tx.commissionSetting.update({
        where: { id: globalRow.id },
        data: { centerPerStudentBp: FALLBACK_GLOBAL_BP },
      });
      globalRate = { fee: null, bp: FALLBACK_GLOBAL_BP };
      console.log(`  · filled the missing global per-student cap (${FALLBACK_GLOBAL_BP / 100}%)`);
    } else {
      console.log(
        `  · kept YOUR global cap: ${
          globalRate!.bp != null ? `${globalRate!.bp / 100}%` : `${globalRate!.fee! / 100} EGP`
        }`,
      );
    }

    // A flat-fee platform cap cannot be demoed with percentage hall rates —
    // the two forms are not comparable, which is a rule of the feature, not a
    // seed limitation. Say so instead of writing rows the app would reject.
    const capBp = globalRate!.bp;
    if (capBp == null) {
      console.warn(
        "  ! your global cap is a FLAT amount, so the halls below are seeded with no own rate\n" +
          "    (a hall must quote in the platform's form). Switch the global rate to a percentage\n" +
          "    to see the center-set-rate states.",
      );
    }

    // ---- users ------------------------------------------------------------
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
    // onboardingCompleted, or every login lands on the wizard instead of the
    // screens this seed exists to show.
    await tx.teacherProfile.upsert({
      where: { userId: TEACHER.id },
      update: { onboardingCompleted: true },
      create: {
        userId: TEACHER.id,
        walletBalance: 0,
        onboardingCompleted: true,
        lessonPrice: 15_000, // 150 EGP — the price a per-student % applies to
      },
    });

    // ---- centers ----------------------------------------------------------
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
          // Without this the owner lands on the onboarding wizard, never on
          // the rooms screen this seed exists to populate.
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

    // ---- the second center's OWN cap (center > global) ---------------------
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

    // ---- halls -------------------------------------------------------------
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

      // The cap this hall is measured against — its center's, else the
      // platform's. Exactly the precedence resolveMethod2Rate applies.
      const capForHall = h.center.id === NOKHBA.id ? (nokhbaCap ?? capBp) : capBp;
      // "ofok-4" demonstrates the boundary: priced exactly AT its cap.
      const wanted = h.key === "ofok-4" ? capForHall : h.ownBp;
      const own =
        wanted == null || capForHall == null ? null : Math.min(wanted, capForHall);

      const existingRoomRow = await tx.commissionSetting.findFirst({
        where: { scope: "room", roomId: id },
      });
      if (own == null) {
        // Inheriting: make sure no stale override survives a re-run.
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
