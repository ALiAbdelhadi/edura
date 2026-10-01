import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  adminCreateCollaborationRequest,
  adminInviteTeacher,
} from "@repo/server-core/backoffice/admin/center-people";
import type { SessionUser } from "@repo/server-core/backoffice-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

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
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`);
}
async function rejects(fn: () => Promise<unknown>, expect: RegExp) {
  try {
    await fn();
    return { threw: false, matched: false, message: "(resolved — no error)" };
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    return { threw: true, matched: expect.test(message), message };
  }
}

async function main() {
  const tag = "collab-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!COL", 10);
  const users: string[] = [];
  const centers: string[] = [];

  const mkUser = async (key: string, role: string, status = "active") => {
    const id = (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
         VALUES ($1,$2,$3,$4,$5,true,now()) RETURNING id`,
        [`${tag}-${key}@edura.test`, role, `${tag}-${key}`, status, hash],
      )
    ).rows[0].id as string;
    users.push(id);
    return id;
  };
  const mkCenter = async (key: string) => {
    const id = (
      await admin.query(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-${key}`, `${tag}${key}`.toUpperCase().slice(0, 20)],
      )
    ).rows[0].id as string;
    centers.push(id);
    return id;
  };

  try {
    console.log(`BACK-OFFICE COLLABORATION REQUEST — ${tag}`);

    const superAdminId = await mkUser("super", "super_admin");
    const actor = {
      id: superAdminId,
      role: "super_admin",
      email: `${tag}-super@edura.test`,
      name: `${tag}-super`,
    } as SessionUser;

    const centerA = await mkCenter("A");
    const centerB = await mkCenter("B");
    const registered = await mkUser("registered", "teacher");
    const registeredEmail = `${tag}-registered@edura.test`;
    const shellTeacher = await mkUser("shell", "teacher", "shell");

    const grade = (await admin.query(`SELECT id FROM grade_levels ORDER BY sort_order LIMIT 1`))
      .rows[0];
    const offered = (
      await admin.query(
        `SELECT subject_id, track_id FROM subject_offerings
         WHERE grade_level_id=$1 AND is_active LIMIT 1`,
        [grade.id],
      )
    ).rows[0];
    const unoffered = (
      await admin.query(
        `SELECT id FROM subjects WHERE id NOT IN (
           SELECT subject_id FROM subject_offerings WHERE grade_level_id=$1
         ) LIMIT 1`,
        [grade.id],
      )
    ).rows[0];

    const bothMethodsRoom = (
      await admin.query(
        `INSERT INTO rooms (center_id, name, capacity, price, allowed_pricing_methods, updated_at)
         VALUES ($1,'Both-methods hall',30,25000,
                 '{whole_room_percent,per_attending_student}', now())
         RETURNING id`,
        [centerA],
      )
    ).rows[0].id as string;

    const base = {
      teacherId: registered,
      subjectId: offered.subject_id as string,
      gradeLevelId: grade.id as string,
      trackId: (offered.track_id as string | null) ?? null,
      daysOfWeek: [0, 3],
      startTime: "16:00",
      endTime: "18:00",
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    section("1 — the invite path still refuses a registered teacher");
    const refused = await rejects(
      () => adminInviteTeacher(actor, centerA, { email: registeredEmail }),
      /already registered|collaboration request/i,
    );
    assert(
      refused.threw && refused.matched,
      `invite refuses a registered teacher and names the alternative — "${refused.message}"`,
    );

    section("2 — the collaboration request clears it");
    const request = await adminCreateCollaborationRequest(actor, centerA, base);
    assert(request.status === "pending", "created with status=pending (nothing is active yet)");
    assert(request.initiator === "center", 'initiator="center" — sent AS the center');
    assert(request.centerId === centerA, "bound to the center the back office was acting on");
    assert(request.teacherId === registered, "aimed at the registered teacher");

    section("3 — attribution, not impersonation");
    const createdByRow = (
      await admin.query(`SELECT created_by FROM collaboration_requests WHERE id=$1`, [request.id])
    ).rows[0];
    assert(
      createdByRow.created_by === superAdminId,
      "created_by is the SUPER ADMIN's own id, not a center admin's",
    );

    section("4 — no rate crosses the boundary");
    const moneyCols = (
      await admin.query(
        `SELECT proposed_center_share, proposed_pricing_method
         FROM collaboration_requests WHERE id=$1`,
        [request.id],
      )
    ).rows[0];
    assert(
      Number(moneyCols.proposed_center_share) === 0,
      "proposed_center_share is 0 — the kernel forces it; the back office cannot propose a rate",
    );
    assert(
      moneyCols.proposed_pricing_method === null,
      "no pricing method on a hall-less request",
    );

    section("5 — the center may not pre-pick the method on a both-methods hall");
    const prePick = await rejects(
      () =>
        adminCreateCollaborationRequest(actor, centerA, {
          ...base,
          subjectId: offered.subject_id,
          roomId: bothMethodsRoom,
          proposedPricingMethod: "per_attending_student",
          daysOfWeek: [1],
        }),
      /teacher chooses the pricing method/i,
    );
    assert(
      prePick.threw && prePick.matched,
      `a center-supplied pricing method is refused — "${prePick.message}"`,
    );
    const hallRequest = await adminCreateCollaborationRequest(actor, centerA, {
      ...base,
      roomId: bothMethodsRoom,
      daysOfWeek: [1],
      teacherId: await (async () => {
        const t2 = await mkUser("registered2", "teacher");
        return t2;
      })(),
    });
    const hallCols = (
      await admin.query(
        `SELECT proposed_pricing_method FROM collaboration_requests WHERE id=$1`,
        [hallRequest.id],
      )
    ).rows[0];
    assert(
      hallCols.proposed_pricing_method === null,
      "a both-methods hall stores NULL — the teacher picks at accept time",
    );

    section("6 — exactly one audit row");
    const auditRows = (
      await admin.query(
        `SELECT * FROM audit_logs
         WHERE action='collaboration_request.created' AND target_id=$1 AND actor_id=$2`,
        [request.id, superAdminId],
      )
    ).rows;
    assert(auditRows.length === 1, `exactly ONE collaboration_request.created row (got ${auditRows.length})`);
    assert(auditRows[0]?.center_id === centerA, "the audit row carries the center");
    assert(auditRows[0]?.target_type === "collaboration_request", "target_type is the request");
    assert(
      auditRows[0]?.on_behalf_of === null,
      "on_behalf_of stays NULL — a super admin acts as themselves",
    );
    assert(
      Number((auditRows[0]?.after_state as { proposedCenterShare?: number })?.proposedCenterShare) === 0,
      "the trail records the zero share, so 'no rate was smuggled' is checkable after the fact",
    );

    section("7 — the center comes from the caller, not the body");
    const onB = await adminCreateCollaborationRequest(actor, centerB, {
      ...base,
      daysOfWeek: [2],
    });
    assert(onB.centerId === centerB, "acting on B creates on B");
    const strayOnA = (
      await admin.query(
        `SELECT count(*)::int AS n FROM collaboration_requests WHERE id=$1 AND center_id=$2`,
        [onB.id, centerA],
      )
    ).rows[0].n;
    assert(strayOnA === 0, "…and nothing of it landed on A");

    section("8 — the kernel's guards still bite from the back office");
    const dup = await rejects(
      () => adminCreateCollaborationRequest(actor, centerA, base),
      /already exists/i,
    );
    assert(dup.threw && dup.matched, `duplicate open request refused — "${dup.message}"`);

    if (unoffered) {
      const badCatalog = await rejects(
        () =>
          adminCreateCollaborationRequest(actor, centerA, {
            ...base,
            subjectId: unoffered.id,
            daysOfWeek: [4],
          }),
        /not offered/i,
      );
      assert(
        badCatalog.threw && badCatalog.matched,
        `a subject not offered for the grade is refused — "${badCatalog.message}"`,
      );
    } else {
      console.log("  · skipped: every subject is offered for this grade in the test catalog");
    }

    const inactive = await rejects(
      () =>
        adminCreateCollaborationRequest(actor, centerA, {
          ...base,
          teacherId: shellTeacher,
          daysOfWeek: [5],
        }),
      /not found|not active/i,
    );
    assert(
      inactive.threw && inactive.matched,
      `a shell (unclaimed) teacher is refused — "${inactive.message}"`,
    );

    section("9 — the teacher is notified");
    const notif = (
      await admin.query(
        `SELECT count(*)::int AS n FROM notifications
         WHERE user_id=$1 AND type='classroom_request'`,
        [registered],
      )
    ).rows[0].n;
    assert(notif >= 1, `the target teacher received a classroom_request notification (${notif})`);

    section("10 — nothing is active, and no money moved");
    const affs = (
      await admin.query(
        `SELECT count(*)::int AS n FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`,
        [centers],
      )
    ).rows[0].n;
    assert(affs === 0, "NO affiliation exists yet — only the teacher's acceptance creates one");

    const courseCount = (
      await admin.query(
        `SELECT count(*)::int AS n FROM courses WHERE center_id = ANY($1::uuid[])`,
        [centers],
      )
    ).rows[0].n;
    assert(courseCount === 0, "no course and no schedule yet — acceptance does that");

    for (const [table, sql] of [
      ["transactions", `SELECT count(*)::int AS n FROM transactions WHERE center_id = ANY($1::uuid[])`],
      ["payments", `SELECT count(*)::int AS n FROM payments WHERE center_id = ANY($1::uuid[])`],
      ["payouts", `SELECT count(*)::int AS n FROM payouts WHERE center_id = ANY($1::uuid[])`],
      ["session_settlements", `SELECT count(*)::int AS n FROM session_settlements WHERE center_id = ANY($1::uuid[])`],
      ["wallet_ledger", `SELECT count(*)::int AS n FROM wallet_ledger WHERE center_id = ANY($1::uuid[])`],
    ] as const) {
      const n = (await admin.query(sql, [centers])).rows[0].n;
      assert(n === 0, `money witness: zero ${table} rows for these centers`);
    }
    const walletMoved = (
      await admin.query(
        `SELECT count(*)::int AS n FROM centers WHERE id = ANY($1::uuid[]) AND wallet_balance <> 0`,
        [centers],
      )
    ).rows[0].n;
    assert(walletMoved === 0, "money witness: no center wallet balance moved");
  } finally {
    const u = users;
    const c = centers;
    await admin.query(`DELETE FROM collaboration_requests WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM rooms WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM invite_tokens WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(
      `DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`,
      [u, c],
    );
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite center-collab-create.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
