// C-5 — the duplicate-row races C-4 did not cover (MIGRATION_PLAN_C5.md).
//
// Four writers were findFirst-then-create with nothing in the database behind
// them: the three blacklist imposers and proposeAgreement. Migration
// 20260905120000_dedupe_guards_c5 adds one partial unique per key. This suite
// proves each index exists and is valid, that a real concurrent double-submit
// leaves exactly ONE live row with the domain message on the loser, that the
// indexes are partial (a lifted ban can be re-imposed, an approved proposal's
// pair can be proposed again), and that the loser left no cascade journal or
// audit row behind.
import { withPlatformContext } from "@repo/database";
import {
  AGREEMENT_ONE_PROPOSED_PER_PAIR,
  BLACKLIST_CENTER_ONE_ACTIVE,
  BLACKLIST_PLATFORM_ONE_ACTIVE,
  BLACKLIST_TEACHER_ONE_ACTIVE,
} from "@repo/server-core/db/unique-indexes";
import {
  centerBlacklistStudent,
  platformBlacklistUser,
  removeBlacklistEntry,
  teacherBlacklistStudent,
} from "@repo/server-core/services/blacklist/blacklist";
import {
  approveAgreementTx,
  proposeAgreement,
} from "@repo/server-core/services/finance/agreements";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
let __userIds: string[] = [];
const SUITE_NAME = "c05-dedupe-guards.test.ts";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const msg = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected" ? ((r.reason as Error)?.message ?? "") : "";
const won = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === "fulfilled").length;
const lost = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === "rejected");

async function main() {
  const tag = "c05dg-" + rid();
  __sweepTag = tag;
  console.log("C-5 dedupe guards —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mk = (role: "super_admin" | "teacher" | "student" | "center_admin", k: string) =>
      tx.user.create({
        data: { name: `${tag}-${k}`, role, email: `${tag}-${k}@x.io`, status: "active" },
      });
    const [admin, teacher, teacherB, student, owner] = await Promise.all([
      mk("super_admin", "su"),
      mk("teacher", "t"),
      mk("teacher", "tb"),
      mk("student", "s"),
      mk("center_admin", "own"),
    ]);
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: `${tag}`.slice(0, 12).toUpperCase(), subjects: [] },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    await tx.centerStudentRoster.create({
      data: { centerId: center.id, studentId: student.id },
    });
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        status: "active",
        centerShare: 0,
        respondedAt: new Date(),
        expiresAt,
      },
    });
    return {
      admin: admin.id,
      teacher: teacher.id,
      teacherB: teacherB.id,
      student: student.id,
      owner: owner.id,
      center: center.id,
    };
  });
  __userIds = [fx.admin, fx.teacher, fx.teacherB, fx.student, fx.owner];
  const su = { id: fx.admin, role: "super_admin" } as SessionUser;
  const teacherUser = { id: fx.teacher, role: "teacher" } as SessionUser;
  const ownerUser = { id: fx.owner, role: "center_admin", centerId: fx.center } as SessionUser;

  const INDEXES = [
    BLACKLIST_PLATFORM_ONE_ACTIVE,
    BLACKLIST_CENTER_ONE_ACTIVE,
    BLACKLIST_TEACHER_ONE_ACTIVE,
    AGREEMENT_ONE_PROPOSED_PER_PAIR,
  ];

  console.log("\nVP1 — the four indexes exist, are UNIQUE and are VALID");
  const idx = await withPlatformContext(
    (tx) => tx.$queryRaw<{ idx: string; indisunique: boolean; indisvalid: boolean }[]>`
      SELECT indexrelid::regclass::text AS idx, indisunique, indisvalid
        FROM pg_index
       WHERE indexrelid::regclass::text IN (
         ${INDEXES[0]}, ${INDEXES[1]}, ${INDEXES[2]}, ${INDEXES[3]})`,
  );
  for (const name of INDEXES) {
    const row = idx.find((r) => r.idx === name);
    assert(
      !!row && row.indisunique && row.indisvalid,
      `${name} exists, unique and valid${row ? "" : " (MISSING — migration 20260905120000_dedupe_guards_c5 not applied?)"}`,
    );
  }

  const activeEntries = (level: "platform" | "center" | "teacher") =>
    withPlatformContext((tx) =>
      tx.blacklistEntry.count({ where: { targetId: fx.student, level, isActive: true } }),
    );
  const journalRows = () =>
    withPlatformContext((tx) => tx.blacklistCascadeAction.count({ where: { targetId: fx.student } }));
  // The auto-audit extension keys `blacklist.added` by the ENTRY id, not the
  // student, so count rows whose target is one of this student's entries. The
  // loser's insert never returned an id, so it can have no row here.
  const auditRows = async () =>
    withPlatformContext(async (tx) => {
      const ids = (
        await tx.blacklistEntry.findMany({ where: { targetId: fx.student }, select: { id: true } })
      ).map((e) => e.id);
      return tx.auditLog.count({ where: { action: "blacklist.added", targetId: { in: ids } } });
    });

  console.log("\nVP2 — two concurrent platformBlacklistUser calls leave exactly ONE active ban");
  const auditBefore = await auditRows();
  const pRace = await Promise.allSettled([
    platformBlacklistUser(fx.student, `${tag} p1`, fx.admin),
    platformBlacklistUser(fx.student, `${tag} p2`, fx.admin),
  ]);
  assert(won(pRace) === 1 && lost(pRace).length === 1, `exactly one call won (won ${won(pRace)}, lost ${lost(pRace).length})`);
  assert((await activeEntries("platform")) === 1, "exactly ONE active platform entry in the database");
  assert(
    lost(pRace).some((r) => msg(r).includes("already platform-blacklisted")),
    `the loser reads the domain message (got: "${msg(lost(pRace)[0] ?? pRace[0]).slice(0, 90)}")`,
  );
  assert((await auditRows()) - auditBefore === 1, "exactly one auto-audit row for the one ban that happened");
  const userStatus = await withPlatformContext((tx) =>
    tx.user.findUnique({ where: { id: fx.student }, select: { status: true } }),
  );
  assert(userStatus?.status === "blacklisted", "the winner's status change committed");

  console.log("\nVP3 — the platform index is PARTIAL: a lifted ban can be re-imposed");
  const pEntry = await withPlatformContext((tx) =>
    tx.blacklistEntry.findFirstOrThrow({ where: { targetId: fx.student, level: "platform", isActive: true } }),
  );
  await removeBlacklistEntry(pEntry.id, su, "lifted");
  const reban = await platformBlacklistUser(fx.student, `${tag} p3`, fx.admin)
    .then(() => true)
    .catch((e: Error) => e.message);
  assert(reban === true, `re-banning after a lift succeeds (${reban})`);
  const pEntry2 = await withPlatformContext((tx) =>
    tx.blacklistEntry.findFirstOrThrow({ where: { targetId: fx.student, level: "platform", isActive: true } }),
  );
  await removeBlacklistEntry(pEntry2.id, su, "lifted again");
  assert((await activeEntries("platform")) === 0, "no active platform entry remains after the lift");

  console.log("\nVP4 — two concurrent centerBlacklistStudent calls leave exactly ONE active centre ban");
  const journalBefore = await journalRows();
  const cRace = await Promise.allSettled([
    centerBlacklistStudent(fx.student, `${tag} c1`, su, fx.center),
    centerBlacklistStudent(fx.student, `${tag} c2`, su, fx.center),
  ]);
  assert(won(cRace) === 1 && lost(cRace).length === 1, `exactly one call won (won ${won(cRace)}, lost ${lost(cRace).length})`);
  assert((await activeEntries("center")) === 1, "exactly ONE active centre entry in the database");
  assert(
    lost(cRace).some((r) => msg(r).includes("already blacklisted at this center")),
    `the loser reads the domain message (got: "${msg(lost(cRace)[0] ?? cRace[0]).slice(0, 90)}")`,
  );
  assert((await journalRows()) === journalBefore, "the loser left no cascade journal row (no enrolments here, so none for the winner either)");
  const cEntry = await withPlatformContext((tx) =>
    tx.blacklistEntry.findFirstOrThrow({ where: { targetId: fx.student, level: "center", isActive: true } }),
  );
  await removeBlacklistEntry(cEntry.id, su, "lifted");
  const roster = await withPlatformContext((tx) =>
    tx.centerStudentRoster.findFirstOrThrow({
      where: { centerId: fx.center, studentId: fx.student },
      select: { blacklisted: true },
    }),
  );
  assert(roster.blacklisted === false, "one lift clears the roster flag — no second ban is holding it");

  console.log("\nVP5 — two concurrent teacherBlacklistStudent calls leave exactly ONE active teacher ban");
  const tRace = await Promise.allSettled([
    teacherBlacklistStudent(fx.student, `${tag} t1`, teacherUser),
    teacherBlacklistStudent(fx.student, `${tag} t2`, teacherUser),
  ]);
  assert(won(tRace) === 1 && lost(tRace).length === 1, `exactly one call won (won ${won(tRace)}, lost ${lost(tRace).length})`);
  assert((await activeEntries("teacher")) === 1, "exactly ONE active teacher entry in the database");
  assert(
    lost(tRace).some((r) => msg(r).includes("already blacklisted this student")),
    `the loser reads the domain message (got: "${msg(lost(tRace)[0] ?? tRace[0]).slice(0, 90)}")`,
  );
  const otherTeacher = await teacherBlacklistStudent(fx.student, `${tag} tb`, {
    id: fx.teacherB,
    role: "teacher",
  } as SessionUser)
    .then(() => true)
    .catch(() => false);
  assert(otherTeacher, "a DIFFERENT teacher banning the same student is unaffected — the key is (target, imposer)");
  assert((await activeEntries("teacher")) === 2, "two active teacher entries, one per teacher");

  console.log("\nVP6 — two concurrent proposeAgreement calls leave exactly ONE pending proposal");
  const proposal = { teacherId: fx.teacher, basis: "percent_of_net" as const, rateBp: 5000 };
  const aRace = await Promise.allSettled([
    proposeAgreement(proposal, ownerUser),
    proposeAgreement({ ...proposal, rateBp: 6000 }, ownerUser),
  ]);
  const proposed = () =>
    withPlatformContext((tx) =>
      tx.teacherAgreement.count({ where: { centerId: fx.center, teacherId: fx.teacher, status: "proposed" } }),
    );
  assert(won(aRace) === 1 && lost(aRace).length === 1, `exactly one call won (won ${won(aRace)}, lost ${lost(aRace).length})`);
  assert((await proposed()) === 1, "exactly ONE proposed agreement in the database");
  assert(
    lost(aRace).some((r) => msg(r).includes("already awaiting approval")),
    `the loser reads the domain message (got: "${msg(lost(aRace)[0] ?? aRace[0]).slice(0, 90)}")`,
  );

  console.log("\nVP7 — the proposal index is PARTIAL: an approved pair can be proposed again");
  const pending = await withPlatformContext((tx) =>
    tx.teacherAgreement.findFirstOrThrow({
      where: { centerId: fx.center, teacherId: fx.teacher, status: "proposed" },
    }),
  );
  await withPlatformContext((tx) => approveAgreementTx(tx, pending.id, fx.owner));
  const again = await proposeAgreement({ ...proposal, rateBp: 7000 }, ownerUser)
    .then(() => true)
    .catch((e: Error) => e.message);
  assert(again === true, `a second proposal after approval is accepted (${again})`);
  assert((await proposed()) === 1, "…and it is the only pending one");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    // Rows the sweep does not know about, deleted before it removes the users.
    if (__userIds.length) {
      await withPlatformContext(async (tx) => {
        await tx.blacklistCascadeAction.deleteMany({ where: { targetId: { in: __userIds } } });
        await tx.blacklistEntry.deleteMany({ where: { targetId: { in: __userIds } } });
        await tx.teacherAgreement.deleteMany({ where: { teacherId: { in: __userIds } } });
      }).catch((e) => console.error("  ! FAILED to remove C-5 rows:", e));
    }
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
