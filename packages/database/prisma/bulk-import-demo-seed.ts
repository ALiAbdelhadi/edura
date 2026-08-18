import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

// ---------------------------------------------------------------------------
// BULK STUDENT IMPORT demo — a center, the two staff tiers, and a spreadsheet.
//
// WHY THIS SEED WRITES FILES AS WELL AS ROWS. Every other demo seed populates
// screens; this feature's input IS a file, and a dialog with nothing to upload
// demonstrates nothing. So it writes two ready-to-upload CSVs next to itself
// and prints their paths. `--purge` removes them along with the rows.
//
// THE ROSTER IS DELIBERATELY NOT EMPTY. Two students already exist on the
// platform before the import runs — one findable by PHONE, one by NATIONAL ID
// — and the spreadsheet contains both. That is the single most important thing
// to watch: the importer REUSES them rather than creating a second record for
// the same child, using the counter's own `findStudentByKeys` and not a second
// definition of its own. An import into an empty database would hide it.
//
// THE MESSY FILE IS THE POINT OF THE SECOND ONE. It carries a duplicate row, a
// row with no name, and a row whose phone collides with a child from another
// center — so the dry run reports created / reused / duplicate / error side by
// side, and the per-row isolation is visible rather than asserted.
//
// ZERO money rows (per the Conventions rule): importing a name is not a
// financial event, which is the whole reason the importer touches no
// subscription, payment or enrolment. Nothing here does either.
// ---------------------------------------------------------------------------

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-bulkimportdemo:");

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({ id: did(key), key, name, role });

const LEILA = P("leila", "ليلى عبد العزيز", "center_admin"); // owner
const HASSAN = P("hassan", "حسن العدوي", "center_staff"); // MANAGER — may import
const RANIA = P("rania", "رانيا فتحي", "center_staff"); // receptionist — may NOT

/** Already on the platform, and in the spreadsheet: matched by PHONE. */
const KNOWN_BY_PHONE = P("known-phone", "يوسف مراد", "student");
/** Already on the platform, and in the spreadsheet: matched by NATIONAL ID. */
const KNOWN_BY_NID = P("known-nid", "جنى عاطف", "student");
/** Belongs to ANOTHER center — proves reuse is platform-wide, not per-center. */
const OTHER_CENTER_KID = P("other-kid", "آدم شريف", "student");

const STAFF = [LEILA, HASSAN, RANIA];
const KIDS = [KNOWN_BY_PHONE, KNOWN_BY_NID, OTHER_CENTER_KID];
const ALL = [...STAFF, ...KIDS];

const email = (p: Person) => `bimpdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const CENTER = did("center");
const CENTER_SHORT_ID = "BULKIMPDEMO1";
const OTHER_CENTER = did("center:other");
const OTHER_SHORT_ID = "BULKIMPDEMO2";

const PHONE_KNOWN = "01099880011";
const PHONE_OTHER = "01099880022";
const NID_KNOWN = "30105150101234";

/**
 * Where the uploadable files land. Created by the seed, removed by --purge.
 * `import.meta.url`, not `__dirname` — this package runs as ESM.
 */
const FILES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "demo-files",
  "bulk-import",
);

// ---------------------------------------------------------------------------
// The spreadsheets. Arabic headers, because that is what a center exports.
// ---------------------------------------------------------------------------

/** A clean file: 10 new children, plus the two the platform already knows. */
const CLEAN_CSV = [
  "الاسم,الهاتف,الرقم القومي,ولي الأمر,هاتف ولي الأمر,بريد ولي الأمر",
  `مريم صلاح,01011220001,,أ. صلاح مريم,01011220101,bimpdemo-g1@edura.test`,
  `عبد الرحمن ياسر,01011220002,,ياسر عبد الرحمن,01011220102,`,
  `"الشيماء محمود، الكبرى",01011220003,,محمود الشيماء,01011220103,bimpdemo-g3@edura.test`,
  `فارس هيثم,01011220004,30203030303030,هيثم فارس,01011220104,`,
  `تسنيم رمضان,01011220005,,,,`,
  `مازن الديب,01011220006,,أم مازن,01011220106,bimpdemo-g6@edura.test`,
  `رقية سيد,01011220007,,,01011220107,`,
  `عمرو الشافعي,01011220008,,الشافعي عمرو,,`,
  `لينا بهاء,01011220009,,بهاء لينا,01011220109,bimpdemo-g9@edura.test`,
  `كنزي وائل,01011220010,,وائل كنزي,01011220110,`,
  `يوسف مراد,${PHONE_KNOWN},,مراد يوسف,01011220111,`,
  `جنى عاطف,,${NID_KNOWN},عاطف جنى,01011220112,`,
  "",
].join("\n");

/** The same file after a human touched it. Every failure mode a row can have. */
const MESSY_CSV = [
  "الاسم,الهاتف,الرقم القومي,ولي الأمر,هاتف ولي الأمر,بريد ولي الأمر",
  `سيف الدين قاسم,01011330001,,قاسم سيف,01011330101,`,
  `نيرة عصام,01011330002,,عصام نيرة,01011330102,bimpdemo-g20@edura.test`,
  // Same phone as the row above it — caught INSIDE the file, before any write.
  `نيرة عصام (مكرر),01011330002,,عصام نيرة,01011330102,`,
  // No name. The one column the importer requires.
  `,01011330003,,مجهول,01011330103,`,
  // A child who belongs to ANOTHER center: reused, not duplicated, and NOT
  // silently moved — the import adds them to this center's roster as well.
  `آدم شريف,${PHONE_OTHER},,شريف آدم,01011330104,`,
  `هالة نبيل,01011330005,,نبيل هالة,01011330105,`,
  "",
].join("\n");


async function purge() {
  console.log("Purging bulk-import demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: { OR: [{ shortId: CENTER_SHORT_ID }, { shortId: OTHER_SHORT_ID }, { id: { in: [CENTER, OTHER_CENTER] } }] },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);

    // Everything an actual IMPORT created, not only what this seed created:
    // running the import in the preview is the whole point, so the purge has
    // to clear its output too. Import rows are reachable only by roster.
    const roster = await tx.centerStudentRoster.findMany({
      where: { centerId: { in: centerIds } },
      select: { studentId: true },
    });
    const importedIds = roster.map((r) => r.studentId).filter((id) => !ids.includes(id));

    await tx.centerStudentRoster.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: [...ids, ...importedIds] } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: [...ids, ...importedIds] } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
    // Raw hard delete: user.deleteMany is soft-delete-intercepted and would
    // leave the UNIQUE emails and phones behind (P2002 on the next run).
    const all = [...ids, ...importedIds];
    /* `user_prefs` holds the guided tour's "seen it" flag, and its FK to users
       is RESTRICT — so once ANY seeded account has signed in and been offered a
       tour, deleting that user is refused and the whole purge aborts. The table
       postdates this seed, which is why it was not in the list. */
    await tx.$executeRaw`DELETE FROM user_prefs WHERE user_id = ANY(${all}::uuid[])`;

    const hardDeleted =
      all.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${all}::uuid[])`;

    console.log("Purged:", {
      users: hardDeleted,
      ofWhichImported: importedIds.length,
      centers: centerIds.length,
    });
  });

  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  console.log("Purged (including the sample spreadsheets).");
}

async function main() {
  await assertNotProduction("bulk-import-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding bulk-import demo…");

  // SEVERAL SMALL TRANSACTIONS, not one big one. Each upsert is a round trip to
  // a remote Neon, and the whole seed comfortably exceeds the 20s interactive
  // transaction limit when run from a laptop. Raising the timeout would hold a
  // connection and a snapshot open for half a minute to no purpose: a demo seed
  // needs no atomicity across its phases, and every write below is an upsert,
  // so a failed run is fixed by running it again.
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
          // The two known children carry the PHONES the spreadsheet will match
          // on; `users.phone` is globally UNIQUE and is the first dedup key.
          ...(p.key === "known-phone" ? { phone: PHONE_KNOWN } : {}),
          ...(p.key === "other-kid" ? { phone: PHONE_OTHER } : {}),
          passwordHash: hash,
          status: "active",
          locale: "ar",
          isDemo: true,
        },
      });
    }
  });

  await withPlatformContext(async (tx) => {
    for (const [id, name, shortId, owner] of [
      [CENTER, "سنتر المستقبل — فرع شبرا", CENTER_SHORT_ID, LEILA.id],
      [OTHER_CENTER, "سنتر النور — فرع حلوان", OTHER_SHORT_ID, null],
    ] as const) {
      await tx.center.upsert({
        where: { id },
        update: { isDemo: true, status: "active" },
        create: {
          id,
          name,
          shortId,
          status: "active",
          ...(owner ? { ownerUserId: owner } : {}),
          governorate: "القاهرة",
          isDemo: true,
        },
      });
    }

    await tx.centerAdminProfile.upsert({
      where: { userId: LEILA.id },
      update: { centerId: CENTER },
      create: { userId: LEILA.id, centerId: CENTER },
    });

    // The two tiers, side by side. The import is MANAGER-only: the counter
    // flow is one child in front of you, this writes hundreds of rows at once.
    for (const [staff, role, title] of [
      [HASSAN, "manager", "مدير الفرع"],
      [RANIA, "receptionist", "مكتب الاستقبال"],
    ] as const) {
      await tx.centerStaff.upsert({
        where: { centerId_staffUserId: { centerId: CENTER, staffUserId: staff.id } },
        update: { role, removedAt: null },
        create: { centerId: CENTER, staffUserId: staff.id, role, title },
      });
    }
  });

  await withPlatformContext(async (tx) => {
    // The children the platform already knows, and the roster each sits on.
    for (const [kid, nid, center] of [
      [KNOWN_BY_PHONE, null, CENTER],
      [KNOWN_BY_NID, NID_KNOWN, CENTER],
      [OTHER_CENTER_KID, null, OTHER_CENTER],
    ] as const) {
      await tx.studentProfile.upsert({
        where: { userId: kid.id },
        update: { fullName: kid.name, nationalId: nid },
        create: {
          userId: kid.id,
          fullName: kid.name,
          entityType: "registered",
          nationalId: nid,
          // `family_link_code` is UNIQUE — strip the punctuation rather than
          // truncating, or `known-phone` and `known-nid` both become `KNOWN-`.
          familyLinkCode: `BIMPDEMO${kid.key.replace(/[^a-z]/g, "").toUpperCase()}`,
        },
      });
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: center, studentId: kid.id } },
        update: { leftAt: null },
        create: { centerId: center, studentId: kid.id },
      });
    }
  });

  fs.mkdirSync(FILES_DIR, { recursive: true });
  // A UTF-8 BOM, because that is what Excel on Windows writes and the parser
  // has to strip it. Shipping the files WITHOUT one would quietly skip the
  // case most likely to arrive from a real center.
  const clean = path.join(FILES_DIR, "roster-clean.csv");
  const messy = path.join(FILES_DIR, "roster-messy.csv");
  fs.writeFileSync(clean, "﻿" + CLEAN_CSV, "utf8");
  fs.writeFileSync(messy, "﻿" + MESSY_CSV, "utf8");

  console.log(`
Seeded. Two spreadsheets are ready to upload:

  ${clean}
      12 rows — 10 new children, plus يوسف مراد (matched by PHONE) and
      جنى عاطف (matched by NATIONAL ID). Both already exist, so the dry run
      should report them as ALREADY KNOWN, never as new.

  ${messy}
      6 rows — one duplicate INSIDE the file, one with no name at all, and
      آدم شريف, who belongs to another center. Expect
      created / reused / duplicate / error in one report, and note that the
      3 good rows still import: one bad row cannot cost the others.

Sign in and open /dashboard/admin/students → "استيراد من ملف":
  MANAGER      ${email(HASSAN)} / ${PASSWORD}   ← may import
  receptionist ${email(RANIA)} / ${PASSWORD}   ← may NOT, and the server says so
  owner        ${email(LEILA)} / ${PASSWORD}

Worth doing, in this order:
  1. Upload the clean file and read the DRY RUN first — nothing is written yet,
     not even an audit row. That report is what a center decides on.
  2. Commit it, then upload the SAME file again: every row now reports as
     already known. One child, one record, however many times you import.
  3. Upload the messy one and look at the line numbers — they point at the row
     in the original spreadsheet, not at the position in the upload chunk.
  4. Check the students screen: nobody has a subscription, a payment or an
     enrolment. Importing a name is not a financial event.

Both files carry a UTF-8 BOM, exactly as Excel on Windows saves them.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
