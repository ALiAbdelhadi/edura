import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma, withPlatformContext } from "@repo/database";
import { GET as guardianGet, POST as guardianPost } from "@/app/api/v1/center/students/[id]/guardian-contact/route";
import { __setSessionOverrideForTests } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "gca-" + Math.floor(Math.random() * 1e9).toString(36);
const seed = Math.floor(Math.random() * 1e9);
const phoneOf = (i: number) => `+2010${String(seed).padStart(9, "0").slice(0, 6)}${String(i).padStart(2, "0")}`;

let ipN = 0;
const freshIp = () => `203.0.113.${(ipN++ % 250) + 1}`;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

async function callRoute(
  handler: (
    req: Request,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<Response> | Response,
  studentId: string,
  method: "GET" | "POST",
  actor: { id: string; centerId: string },
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  __setSessionOverrideForTests(
    () => ({ id: actor.id, role: "center_admin", centerId: actor.centerId, email: null, name: "T", locale: "ar" }) as SessionUser,
  );
  try {
    const res = await handler(
      new Request(`http://localhost:3002/api/v1/center/students/${studentId}/guardian-contact`, {
        method,
        headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { params: Promise.resolve({ id: studentId }) },
    );
    return { status: res.status, body: await res.json() };
  } finally {
    __setSessionOverrideForTests(null);
  }
}

const auditCount = async (studentId: string) =>
  Number((await q<{ n: string }>(
    `SELECT count(*) n FROM audit_logs WHERE action='student.guardian_contact_viewed' AND target_id=$1`,
    [studentId],
  ))[0]!.n);

async function main() {
  console.log("Guardian-contact access (M2) —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const adminA = await tx.user.create({
      data: { name: tag + "-adminA", role: "center_admin", email: tag + "-a@x.io", status: "active", isDemo: true },
    });

    const mk = async (n: number, label: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${label}`, phone: phoneOf(n), role: "student", status: "active", isDemo: true },
      });
      await tx.studentProfile.create({
        data: {
          userId: u.id, fullName: `${tag}-${label}`, phone: phoneOf(n),
          guardianEmail: `${tag}-${label}-guardian@example.com`, guardianPhone: phoneOf(50 + n),
          entityType: "invited", inviteCode: (tag + label).toUpperCase().slice(0, 18),
          familyLinkCode: (tag + "F" + n).toUpperCase().slice(0, 18),
        },
      });
      return u.id;
    };

    const active = await mk(1, "active");
    await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: active } });

    // removal only stamps leftAt — the row stays, which is the whole point of M2
    const departed = await mk(2, "departed");
    await tx.centerStudentRoster.create({
      data: { centerId: centerA.id, studentId: departed, leftAt: new Date() },
    });

    const foreign = await mk(3, "foreign");
    await tx.centerStudentRoster.create({ data: { centerId: centerB.id, studentId: foreign } });

    return { centerA: centerA.id, centerB: centerB.id, adminA: adminA.id, active, departed, foreign };
  });

  const A = { id: fx.adminA, centerId: fx.centerA };

  try {
    console.log("\n[1] the centre that holds the student reads the contact, and is recorded doing so");
    const before = await auditCount(fx.active);
    const r1 = await callRoute(guardianGet, fx.active, "GET", A);
    ok(r1.status === 200, `an active roster student is readable (${r1.status})`);
    ok(
      r1.body?.data?.guardianEmail === `${tag}-active-guardian@example.com`,
      "the guardian email comes back in full — a receptionist has to ring them",
    );
    ok((await auditCount(fx.active)) === before + 1, "the read left exactly one audit row");
    const row = await q<{ actor_id: string; center_id: string; target_type: string }>(
      `SELECT actor_id, center_id, target_type FROM audit_logs
         WHERE action='student.guardian_contact_viewed' AND target_id=$1
         ORDER BY created_at DESC LIMIT 1`, [fx.active],
    );
    ok(row[0]?.actor_id === fx.adminA, "…naming the staff member who read it");
    ok(row[0]?.center_id === fx.centerA, "…and the centre they read it for");

    console.log("\n[2] a student who has LEFT is no longer readable");
    const stillHasRow = await q<{ n: string }>(
      `SELECT count(*) n FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`,
      [fx.centerA, fx.departed],
    );
    ok(Number(stillHasRow[0]?.n) === 1, "the departed student still HAS a roster row — only leftAt separates them");
    const auditBeforeDeparted = await auditCount(fx.departed);
    const r2 = await callRoute(guardianGet, fx.departed, "GET", A);
    ok(r2.status === 404, `reading their guardian contact is refused (${r2.status})`);
    ok((await auditCount(fx.departed)) === auditBeforeDeparted, "a refused read writes no audit row");

    console.log("\n[3] another centre's student is refused, and indistinguishably so");
    const r3 = await callRoute(guardianGet, fx.foreign, "GET", A);
    ok(r3.status === 404, `a foreign student is refused (${r3.status})`);
    ok(
      r3.body?.error?.message === r2.body?.error?.message,
      "…with the same message as a departed one — no way to tell the cases apart",
    );

    console.log("\n[4] the write path is gated by the same rule");
    const r4 = await callRoute(guardianPost, fx.departed, "POST", A, { guardianPhone: phoneOf(99) });
    ok(r4.status === 404, `setting a departed student's guardian contact is refused (${r4.status})`);
    const untouched = await q<{ guardian_phone: string | null }>(
      `SELECT guardian_phone FROM student_profiles WHERE user_id=$1`, [fx.departed],
    );
    ok(untouched[0]?.guardian_phone === phoneOf(52), "…and their stored guardian phone is unchanged");
  } finally {
    const users = [fx.adminA, fx.active, fx.departed, fx.foreign];
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
      const left = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite guardian-contact-access.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
