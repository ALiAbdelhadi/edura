import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { scopedDb, platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import {
  authorizeCenterActor,
  assertCenterActorMethodAllowed,
  RECEPTION,
  ACCOUNTANT,
} from "@/lib/authz/center-actor";
import { resolveActingTeacher } from "@/lib/authz/teacher-actor";
import {
  listTeamNotes,
  createTeamNote,
  updateTeamNote,
  deleteTeamNote,
  type TeamNoteActor,
} from "@/lib/services/team-notes/team-notes";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const STAFF_ALL = [...RECEPTION, ...ACCOUNTANT];

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
async function expectError(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
  label: string,
) {
  try {
    await fn();
    assert(false, `${label} — expected ${cls.name} but call RESOLVED`);
  } catch (e) {
    assert(
      e instanceof cls,
      `${label} -> ${cls.name}${e instanceof cls ? "" : ` (got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message})`}`,
    );
  }
}

const su = (u: { id: string; role: string; centerId?: string; name?: string }): SessionUser =>
  ({
    id: u.id,
    role: u.role,
    centerId: u.centerId,
    locale: "ar",
    name: u.name ?? "test",
    email: null,
  }) as unknown as SessionUser;

async function notifs(userId: string, type: string) {
  return withPlatformContext((tx) =>
    tx.notification.findMany({ where: { userId, type: type as never } }),
  );
}

async function main() {
  const tag = "tn-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Team-notes DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string) =>
      tx.user.create({
        data: {
          name: `${tag}-${key}`,
          role: role as never,
          email: `${tag}-${key}@x.io`,
          status: "active",
        },
      });
    const ownerA = await mkUser("ownerA", "center_admin");
    const recA = await mkUser("recA", "center_staff");
    const mgrA = await mkUser("mgrA", "center_staff");
    const accA = await mkUser("accA", "center_staff");
    const ownerB = await mkUser("ownerB", "center_admin");
    const recB = await mkUser("recB", "center_staff");
    const t1 = await mkUser("t1", "teacher");
    const x1 = await mkUser("x1", "assistant");
    const x2 = await mkUser("x2", "assistant");
    const t2 = await mkUser("t2", "teacher");
    const y = await mkUser("y", "assistant");

    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "AAAA").slice(0, 12).toUpperCase(), status: "active", ownerUserId: ownerA.id },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "BBBB").slice(0, 12).toUpperCase(), status: "active", ownerUserId: ownerB.id },
    });
    await tx.centerAdminProfile.create({ data: { userId: ownerA.id, centerId: centerA.id } });
    await tx.centerAdminProfile.create({ data: { userId: ownerB.id, centerId: centerB.id } });
    await tx.centerStaff.create({ data: { centerId: centerA.id, staffUserId: recA.id, role: "receptionist" } });
    await tx.centerStaff.create({ data: { centerId: centerA.id, staffUserId: mgrA.id, role: "manager" } });
    await tx.centerStaff.create({ data: { centerId: centerA.id, staffUserId: accA.id, role: "center_accountant" } });
    await tx.centerStaff.create({ data: { centerId: centerB.id, staffUserId: recB.id, role: "receptionist" } });
    await tx.teacherAssistant.create({ data: { teacherId: t1.id, assistantId: x1.id } });
    const linkX2 = await tx.teacherAssistant.create({ data: { teacherId: t1.id, assistantId: x2.id } });
    await tx.teacherAssistant.create({ data: { teacherId: t2.id, assistantId: y.id } });

    return {
      ownerA, recA, mgrA, accA, ownerB, recB, t1, x1, x2, t2, y,
      centerA: centerA.id, centerB: centerB.id, linkX2: linkX2.id,
    };
  });

  const U = [fx.ownerA, fx.recA, fx.mgrA, fx.accA, fx.ownerB, fx.recB, fx.t1, fx.x1, fx.x2, fx.t2, fx.y].map((u) => u.id);
  const C = [fx.centerA, fx.centerB];

  const ownerActorA = await authorizeCenterActor(
    su({ id: fx.ownerA.id, role: "center_admin", centerId: fx.centerA, name: "OwnerA" }),
    { allow: STAFF_ALL },
  );
  const recActorA = await authorizeCenterActor(
    su({ id: fx.recA.id, role: "center_staff", name: "RecA" }), { allow: STAFF_ALL });
  const mgrActorA = await authorizeCenterActor(
    su({ id: fx.mgrA.id, role: "center_staff", name: "MgrA" }), { allow: STAFF_ALL });
  const accActorA = await authorizeCenterActor(
    su({ id: fx.accA.id, role: "center_staff", name: "AccA" }), { allow: STAFF_ALL });
  const recActorB = await authorizeCenterActor(
    su({ id: fx.recB.id, role: "center_staff", name: "RecB" }), { allow: STAFF_ALL });

  const teacherShaped = (teacherId: string, name: string) =>
    su({ id: teacherId, role: "teacher", name });
  const t1Actor: TeamNoteActor = {
    acting: teacherShaped(fx.t1.id, "T1"), caller: teacherShaped(fx.t1.id, "T1"),
    actorId: fx.t1.id, onBehalfOf: null,
  };
  const x1Teacher = await platformDb((tx) =>
    resolveActingTeacher(tx, { id: fx.x1.id, role: "assistant" } as never));
  assert(x1Teacher === fx.t1.id, "resolveActingTeacher(x1) -> t1 (real link resolution)");
  const asstActor = (a: { id: string; name: string | null }, teacherId: string): TeamNoteActor => ({
    acting: teacherShaped(teacherId, "T"),
    caller: su({ id: a.id, role: "assistant", name: a.name ?? "A" }),
    actorId: a.id, onBehalfOf: teacherId,
  });
  const x1Actor = asstActor(fx.x1, x1Teacher);
  const x2Actor = asstActor(fx.x2, fx.t1.id);
  const yActor = asstActor(fx.y, fx.t2.id);

  try {
    console.log("\n— center board: create + fanout —");
    const noteA = await createTeamNote(ownerActorA as TeamNoteActor, { body: "سلّموا كشف الحضور قبل ٤" });
    assert(noteA.centerId === fx.centerA && noteA.teacherId === null, "note scoped to center A only");
    assert(noteA.authorUserId === fx.ownerA.id, "author is the caller themselves");
    for (const [who, label] of [[fx.recA, "receptionist"], [fx.mgrA, "manager"], [fx.accA, "accountant"]] as const) {
      assert((await notifs(who.id, "team_note_created")).length === 1, `team_note_created notified: ${label}`);
    }
    assert((await notifs(fx.ownerA.id, "team_note_created")).length === 0, "author NOT notified about own note");
    assert((await notifs(fx.recB.id, "team_note_created")).length === 0, "center B staff NOT notified");

    console.log("\n— listing IS the read receipt —");
    const list1 = await listTeamNotes(recActorA as TeamNoteActor);
    assert(list1.notes.length === 1 && list1.notes[0].id === noteA.id, "receptionist sees the note");
    assert(list1.me.canWrite === true, "receptionist canWrite=true");
    assert(list1.notes[0].readBy.some((r) => r.id === fx.recA.id), "receipt recorded for the lister");
    assert(list1.notes[0].readBy.some((r) => r.id === fx.ownerA.id), "author counted as having read their own note");
    const list2 = await listTeamNotes(recActorA as TeamNoteActor);
    assert(list2.notes[0].readBy.filter((r) => r.id === fx.recA.id).length === 1, "re-list does not duplicate the receipt");
    assert(list1.members.length === 4, "team roster = owner + 3 staff");

    const accList = await listTeamNotes(accActorA as TeamNoteActor);
    assert(accList.me.canWrite === false, "accountant canWrite=false (composer hidden)");
    const accReceipt = await withPlatformContext((tx) =>
      tx.teamNoteRead.findFirst({ where: { noteId: noteA.id, userId: fx.accA.id } }));
    assert(!!accReceipt, "accountant's READ still registers (receipt on GET, not POST)");
    assert(
      (() => { try { assertCenterActorMethodAllowed("center_accountant", "POST"); return false; } catch (e) { return e instanceof ForbiddenError; } })(),
      "accountant POST rejected by the method gate (route invariant)",
    );

    console.log("\n— center↔center isolation —");
    const listB = await listTeamNotes(recActorB as TeamNoteActor);
    assert(listB.notes.length === 0, "center B staff sees ZERO center A notes (service)");
    const rlsPeek = await scopedDb(recActorB.acting, (tx) =>
      tx.teamNote.findFirst({ where: { id: noteA.id } }));
    assert(rlsPeek === null, "raw tenant query from center B cannot see the row (RLS)");
    await expectError(
      () => updateTeamNote(recActorB as TeamNoteActor, noteA.id, { status: "done" }),
      NotFoundError, "center B actor mutating center A note");

    console.log("\n— to-do status semantics —");
    const flipped = await updateTeamNote(recActorA as TeamNoteActor, noteA.id, { status: "done" });
    assert(flipped.status === "done" && flipped.statusChangedById === fx.recA.id, "receptionist marks the owner's note done + attribution");
    assert((await notifs(fx.ownerA.id, "team_note_status_changed")).length === 1, "author notified when someone ELSE flips their note");

    const own = await createTeamNote(recActorA as TeamNoteActor, { body: "ملاحظة الاستقبال" });
    await updateTeamNote(recActorA as TeamNoteActor, own.id, { status: "declined" });
    assert((await notifs(fx.recA.id, "team_note_status_changed")).length === 0, "NO notification on a self-flip");

    console.log("\n— edit / pin / delete permissions —");
    await expectError(
      () => updateTeamNote(recActorA as TeamNoteActor, noteA.id, { body: "hijack" }),
      ForbiddenError, "non-author editing body");
    await expectError(
      () => updateTeamNote(recActorA as TeamNoteActor, noteA.id, { pinned: true }),
      ForbiddenError, "receptionist (not lead) pinning someone else's note");
    const pinned = await updateTeamNote(mgrActorA as TeamNoteActor, noteA.id, { pinned: true });
    assert(pinned.pinned === true, "manager (lead) can pin");
    const edited = await updateTeamNote(recActorA as TeamNoteActor, own.id, { body: "ملاحظة معدّلة" });
    assert(edited.body === "ملاحظة معدّلة", "author edits own body");
    await expectError(
      () => deleteTeamNote(recActorA as TeamNoteActor, noteA.id),
      ForbiddenError, "receptionist deleting the owner's note");
    await deleteTeamNote(mgrActorA as TeamNoteActor, own.id);
    const afterDel = await listTeamNotes(recActorA as TeamNoteActor);
    assert(afterDel.notes.every((n) => n.id !== own.id), "lead soft-deleted a member's note (gone from board)");
    const softRow = await withPlatformContext((tx) =>
      tx.teamNote.findFirst({ where: { id: own.id } }));
    assert(softRow?.deletedAt != null, "delete is SOFT (row kept, deletedAt set)");

    console.log("\n— teacher board —");
    const noteT = await createTeamNote(x1Actor, { body: "ورقة الامتحان جاهزة للطباعة" });
    assert(noteT.teacherId === fx.t1.id && noteT.centerId === null, "note scoped to teacher T1 only");
    assert(noteT.authorUserId === fx.x1.id, "assistant writes as THEMSELVES (no impersonation)");
    assert((await notifs(fx.t1.id, "team_note_created")).length === 1, "teacher notified");
    assert((await notifs(fx.x2.id, "team_note_created")).length === 1, "sibling assistant notified");
    assert((await notifs(fx.x1.id, "team_note_created")).length === 0, "authoring assistant NOT notified");
    assert((await notifs(fx.y.id, "team_note_created")).length === 0, "other teacher's assistant NOT notified");

    const t1List = await listTeamNotes(t1Actor);
    assert(t1List.notes.some((n) => n.id === noteT.id), "teacher sees the board");
    assert(t1List.members.length === 3, "teacher team roster = teacher + 2 assistants");
    const yList = await listTeamNotes(yActor);
    assert(yList.notes.length === 0, "assistant of ANOTHER teacher sees zero notes");
    await expectError(
      () => updateTeamNote(yActor, noteT.id, { status: "done" }),
      NotFoundError, "other team's assistant mutating the note");

    await updateTeamNote(x2Actor, noteT.id, { status: "done" });
    assert((await notifs(fx.x1.id, "team_note_status_changed")).length === 1, "author assistant notified on sibling's flip");
    const x2Pin = await updateTeamNote(x2Actor, noteT.id, { pinned: true });
    assert(x2Pin.pinned === true, "assistant is a lead on the teacher board (Step 8 full delegation)");
    await deleteTeamNote(t1Actor, noteT.id);
    assert((await listTeamNotes(t1Actor)).notes.length === 0, "teacher (lead) removed the note");

    console.log("\n— revocation-aware fanout —");
    await withPlatformContext((tx) =>
      tx.teacherAssistant.update({ where: { id: fx.linkX2 }, data: { removedAt: new Date() } }));
    await createTeamNote(t1Actor, { body: "بعد إزالة كريم" });
    assert((await notifs(fx.x2.id, "team_note_created")).length === 1, "soft-removed assistant got NO new fanout (still 1)");
    assert((await notifs(fx.x1.id, "team_note_created")).length === 1, "active assistant DID get the new fanout");

    console.log("\n— DB CHECK: exactly one scope —");
    for (const [vals, label] of [
      [[fx.centerA, fx.t1.id], "both center_id AND teacher_id"],
      [[null, null], "neither scope"],
    ] as const) {
      try {
        await admin.query(
          `INSERT INTO team_notes (center_id, teacher_id, author_user_id, body) VALUES ($1,$2,$3,'x')`,
          [vals[0], vals[1], fx.ownerA.id],
        );
        assert(false, `${label} — INSERT unexpectedly succeeded`);
      } catch (e) {
        assert((e as { code?: string }).code === "23514", `${label} rejected by CHECK (23514)`);
      }
    }
  } finally {
    const noteRows = await admin.query(
      `SELECT id FROM team_notes WHERE center_id = ANY($1::uuid[]) OR teacher_id = ANY($2::uuid[]) OR author_user_id = ANY($2::uuid[])`,
      [C, U],
    );
    const N = noteRows.rows.map((r: { id: string }) => r.id);
    await admin.query(`DELETE FROM team_note_reads WHERE note_id = ANY($1::uuid[])`, [N]);
    await admin.query(`DELETE FROM team_notes WHERE id = ANY($1::uuid[])`, [N]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM teacher_assistants WHERE teacher_id = ANY($1::uuid[]) OR assistant_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [U]).catch(() => {});
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [C]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite team-notes.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
