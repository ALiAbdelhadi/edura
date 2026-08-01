/**
 * H-03 BEHAVIOURAL PROOF — the four flows the report says "400 on the demo
 * data" now run END TO END on the SEEDED `is_demo` fixtures themselves.
 *
 * BEFORE: `prisma/preview-seed.ts` and `prisma/messaging-demo-seed.ts` built
 * their deterministic ids by slicing a raw SHA-1 digest into the 8-4-4-4-12
 * shape. That is UUID-shaped but not a UUID (RFC 9562 fixes the version and
 * variant nibbles), so ~7 of every 8 seeded ids were rejected by `z.uuid()`:
 *
 *     POST /api/v1/center/checkin {"sessionId":"8a0f946b-50c3-2304-1d26-…"}
 *     -> 400 {"code":"validation_error","fields":{"sessionId":["Invalid UUID"]}}
 *
 * AFTER: the seeds mint genuine UUIDv5 through the one shared generator
 * (`packages/database/prisma/seed-ids.ts`). NO route guard was changed — the
 * structural half of the proof (tests/unit/h03-seed-uuid.test.ts) asserts every
 * one of these fields still declares `z.uuid()`.
 *
 * What this file asserts, driving the REAL route handlers IN-PROCESS with REAL
 * sessions (only the `getServerSession` edge is stubbed — parseJson/zod, the
 * authz wrappers, the services and the DB writes all run for real):
 *   F0  every id in the seeded demo dataset passes the routes' own predicate
 *   F1  counter check-in       — seeded student + seeded session, no 400
 *   F2  walk-in cash           — per-session cash + check-in in ONE step (201),
 *                                ledger written, and the check-in that was 402
 *                                now returns 200 for the SAME seeded ids
 *   F3  checkout               — student checkout on a seeded course -> intent
 *   F4  messaging demo         — conversation with a seeded demo user, and a
 *                                report against a SEEDED conversation id
 *   F5  a legacy-shaped id is still rejected (the guard is intact, not bypassed)
 *   F6  money reconciles back to the pre-run baseline; nothing is left behind
 *
 * MONEY DISCLOSURE: F2/F3 write to the ledger, deliberately and only through
 * `is_demo` seed entities (NILE preview center, demo student Lina Hassan).
 * Everything written is deleted at the end and the money table counts and the
 * touched wallets are asserted back to the pre-run snapshot.
 *
 * F6 compares GLOBAL money-table counts, so it needs the database to itself:
 * another money suite (or a dev server sharing this DB) writing concurrently
 * will shift a count and show up here as a spurious failure. Run it alone.
 *
 * Run — NO server required, and no WWW_BASE_URL: this suite used to drive
 * http://localhost:3002, which is whatever server holds that port. Its writes
 * then travelled on THAT server's connection, where db-guard could not see them
 * (proven 2026-08-01: it created rows in DEV while the guard read `test`).
 * In-process, the only connection is this process's own — the one db-guard
 * validates.
 *   bun run --filter edura test:db                  # all suites, guarded
 *   bun run --filter edura test:db:only h03-seed-uuid-flows
 *   NEVER --env-file=.env.local — that is the DEV database, and it skips the guard.
 */
import { createRequire } from "node:module";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { z } from "zod";
import type { SessionUser } from "@/lib/auth/session";
import { POST as checkinRoute } from "@/app/api/v1/center/checkin/route";
import { POST as centerSubscriptionsRoute } from "@/app/api/v1/center/subscriptions/route";
import { POST as checkoutRoute } from "@/app/api/v1/subscriptions/checkout/route";
import { POST as paymentsInitiateRoute } from "@/app/api/v1/payments/initiate/route";
import { POST as conversationsRoute } from "@/app/api/v1/messages/conversations/route";
import { POST as messageReportsRoute } from "@/app/api/v1/messages/reports/route";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;

const uuid = z.uuid();

let pass = 0,
  fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}
function section(s: string) {
  console.log("\n" + s);
}

// ------------------------------------------------------------------- session
// IN-PROCESS. The ONLY thing stubbed is the cookie -> session read at the very
// edge (`getServerSession`), the same seam invite-claim.test.ts uses. Everything
// inside each route — the centerStaff/authz wrappers, parseJson + zod (which is
// the entire point of this suite), the services and the DB writes — is the real
// code path. Nothing depends on a server being up, so the suite can no longer
// write to whatever database happens to be listening on port 3002.
const nodeRequire = createRequire(__filename);
const nextAuthNext = nodeRequire("next-auth/next") as {
  getServerSession: (...a: unknown[]) => Promise<unknown>;
};
let currentSession: { user: SessionUser } | null = null;
nextAuthNext.getServerSession = async () => currentSession;

/** The session a given seeded user would carry, resolved from the DB row. */
async function sessionFor(userId: string): Promise<{ user: SessionUser }> {
  const u = (
    await q(
      `select u.id,u.email,u.name,u.role,u.locale,
        (select cap.center_id from center_admin_profiles cap where cap.user_id=u.id limit 1) admin_center,
        (select cs.center_id from center_staff cs where cs.staff_user_id=u.id and cs.removed_at is null limit 1) staff_center
       from users u where u.id=$1`,
      [userId],
    )
  )[0] as Record<string, string>;
  return {
    user: {
      id: u.id,
      role: u.role,
      email: u.email,
      name: u.name,
      centerId: u.admin_center ?? u.staff_center ?? undefined,
      locale: u.locale,
    } as SessionUser,
  };
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** path -> the REAL route handler. A path with no entry is a typo, not a 404. */
const ROUTES: Record<string, Handler> = {
  "/api/v1/center/checkin": checkinRoute as Handler,
  "/api/v1/center/subscriptions": centerSubscriptionsRoute as Handler,
  "/api/v1/subscriptions/checkout": checkoutRoute as Handler,
  "/api/v1/payments/initiate": paymentsInitiateRoute as Handler,
  "/api/v1/messages/conversations": conversationsRoute as Handler,
  "/api/v1/messages/reports": messageReportsRoute as Handler,
};

/** A distinct IP per call so the shared rate-limit buckets never starve the run. */
const nextIp = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

async function call(
  method: string,
  path: string,
  session?: { user: SessionUser },
  body?: unknown,
) {
  const handler = ROUTES[path];
  if (!handler) throw new Error(`h03: no in-process handler registered for ${path}`);
  const h: Record<string, string> = { "x-forwarded-for": nextIp() };
  let payload: string | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    h["content-type"] = "application/json";
  }
  currentSession = session ?? null;
  try {
    const res = await handler(
      new Request(`http://localhost${path}`, { method, headers: h, body: payload }),
      { params: Promise.resolve({}) },
    );
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* */
    }
    return { status: res.status, json: json as never, text: text.slice(0, 300) };
  } finally {
    currentSession = null;
  }
}
const D = (r: { json: never }) => (r.json as { data?: never } | null)?.data as never;
/** Was THIS response the H-03 failure (a UUID-shaped field rejected as invalid)? */
const isUuidValidationError = (r: { status: number; text: string }) =>
  r.status === 400 && /invalid uuid/i.test(r.text);

const snapMoney = async () =>
  (
    await q(`select (select count(*) from transactions)::int t,(select count(*) from payments)::int p,
      (select count(*) from wallet_ledger)::int w,(select count(*) from subscriptions)::int s,
      (select count(*) from session_settlements)::int ss,(select count(*) from payment_intents)::int pi,
      (select count(*) from points_ledger)::int pl`)
  )[0] as Record<string, number>;

const userId = async (email: string) =>
  ((await q(`select id from users where email=$1 and deleted_at is null`, [email]))[0] as { id: string } | undefined)
    ?.id;

async function main() {
  // ---------------------------------------------------------------------
  // Fixtures: SEEDED is_demo rows only. Nothing here is created by the test.
  // ---------------------------------------------------------------------
  const lina = await userId("lina.hassan@student.nile-academy.eg");
  const reception = await userId("reception@nile-academy.eg");
  const msgYoussef = await userId("msgdemo-youssef@edura.test");
  const msgKamal = await userId("msgdemo-kamal@edura.test");
  if (!lina || !reception || !msgYoussef || !msgKamal) {
    console.error(
      "Missing seeded fixtures. Run:\n" +
        "  bunx tsx --env-file=.env prisma/seed.ts\n" +
        "  bunx tsx --env-file=.env prisma/preview-seed.ts\n" +
        "  bunx tsx --env-file=.env prisma/messaging-demo-seed.ts",
    );
    process.exit(1);
  }

  // The NILE demo course Lina is enrolled on, and its scheduled seeded sessions.
  // Two are needed: F2 buys a per-session pass for the first, so F3 must check
  // out a DIFFERENT session or it (correctly) hits "an active pass exists".
  const sessions = (await q(
    `select s.id session_id, c.id course_id, c.center_id, c.teacher_id, c.price_per_session
       from sessions s
       join courses c on c.id = s.course_id
       join centers ct on ct.id = c.center_id
       join enrollments e on e.course_id = c.id and e.student_id = $1 and e.status='active'
      where ct.short_id='NILE' and c.is_demo = true and s.status='scheduled'
      order by s.date asc`,
    [lina],
  )) as Record<string, string>[];
  const seeded = sessions[0];
  const seededOther = sessions[1];
  if (!seeded || !seededOther) {
    console.error(
      `Need two scheduled seeded NILE sessions for Lina (found ${sessions.length}) — re-run prisma/preview-seed.ts`,
    );
    process.exit(1);
  }
  // A SEEDED conversation id (messaging demo) for the report flow.
  const seededConv = (
    await q(
      `select c.id, c.user_a_id, c.user_b_id from conversations c
        where $1 in (c.user_a_id, c.user_b_id) limit 1`,
      [msgYoussef],
    )
  )[0] as Record<string, string> | undefined;

  const baseline = await snapMoney();
  const wBefore = (
    await q(
      `select (select wallet_balance from centers where id=$1)::int c,
              (select wallet_balance from teacher_profiles where user_id=$2)::int t,
              (select wallet_balance from student_profiles where user_id=$3)::int s`,
      [seeded.center_id, seeded.teacher_id, lina],
    )
  )[0] as Record<string, number>;

  // Notifications the flows fan out (parents/staff) are not money, but the run
  // should still leave nothing behind: remember what existed, delete the rest.
  const actors = [lina, reception, msgYoussef, msgKamal, seeded.teacher_id];
  const notifBefore = new Set(
    ((await q(`select id from notifications where user_id = any($1::uuid[])`, [actors])) as {
      id: string;
    }[]).map((r) => r.id),
  );

  const receptionSession = await sessionFor(reception);
  const linaSession = await sessionFor(lina);
  const youssefSession = await sessionFor(msgYoussef);

  // =====================================================================
  section("F0 — every id in the seeded demo dataset passes the routes' predicate");
  // =====================================================================
  const idSets: [string, string][] = [
    ["users(is_demo)", `select id from users where is_demo = true`],
    ["centers(is_demo)", `select id from centers where is_demo = true`],
    ["courses(is_demo)", `select id from courses where is_demo = true`],
    ["rooms(demo centers)", `select r.id from rooms r join centers c on c.id=r.center_id where c.is_demo`],
    ["sessions(demo courses)", `select s.id from sessions s join courses c on c.id=s.course_id where c.is_demo`],
    ["grades(demo courses)", `select g.id from grades g join courses c on c.id=g.course_id where c.is_demo`],
    ["materials(demo courses)", `select m.id from materials m join courses c on c.id=m.course_id where c.is_demo`],
    [
      "enrollments(demo students)",
      `select e.id from enrollments e join users u on u.id=e.student_id where u.is_demo`,
    ],
    ["conversations", `select id from conversations`],
    ["conversation_groups", `select id from conversation_groups`],
    ["conversation_messages", `select id from conversation_messages`],
    ["group_messages", `select id from group_messages`],
    ["conversation_blocks", `select id from conversation_blocks`],
    ["conversation_reports", `select id from conversation_reports`],
  ];
  let scanned = 0;
  for (const [label, sql] of idSets) {
    const rows = (await q(sql)) as { id: string }[];
    const bad = rows.filter((r) => !uuid.safeParse(r.id).success);
    scanned += rows.length;
    assert(bad.length === 0, `${label}: ${rows.length} ids, 0 rejected${bad.length ? ` (e.g. ${bad[0]!.id})` : ""}`);
  }
  assert(scanned > 0, `scanned ${scanned} seeded ids in total`);

  // =====================================================================
  section("F1 — counter check-in accepts the SEEDED student + session ids");
  // =====================================================================
  const checkin1 = await call("POST", "/api/v1/center/checkin", receptionSession, {
    studentId: lina,
    sessionId: seeded.session_id,
  });
  assert(!isUuidValidationError(checkin1), `no "Invalid UUID" 400 (was the H-03 failure) — got ${checkin1.status}`);
  assert(
    checkin1.status === 402 || checkin1.status === 200,
    `reached business logic: ${checkin1.status} ${checkin1.status === 402 ? "needs_payment (uncovered)" : "ok"}`,
  );
  const startedUncovered = checkin1.status === 402;

  // =====================================================================
  section("F2 — walk-in cash: per-session cash + check-in in ONE step");
  // =====================================================================
  const walkin = await call("POST", "/api/v1/center/subscriptions", receptionSession, {
    studentId: lina,
    courseId: seeded.course_id,
    plan: "per_session",
    sessionId: seeded.session_id,
    markAttendance: true,
  });
  assert(!isUuidValidationError(walkin), `no "Invalid UUID" 400 on the seeded ids — got ${walkin.status}`);
  assert(walkin.status === 201, `walk-in cash subscription created (201) — got ${walkin.status} ${walkin.text}`);
  const subId = (D(walkin) as { id?: string } | undefined)?.id ?? null;
  assert(!!subId, `subscription id returned: ${subId}`);

  const afterWalkin = await snapMoney();
  assert(afterWalkin.p === baseline.p + 1, `payments ${baseline.p} -> ${afterWalkin.p} (cash payment recorded)`);
  assert(
    afterWalkin.t === baseline.t + 1,
    `transactions ${baseline.t} -> ${afterWalkin.t} (Step-4 ledger mirror in the same tx)`,
  );
  assert(afterWalkin.s === baseline.s + 1, `subscriptions ${baseline.s} -> ${afterWalkin.s}`);

  const checkin2 = await call("POST", "/api/v1/center/checkin", receptionSession, {
    studentId: lina,
    sessionId: seeded.session_id,
  });
  assert(
    checkin2.status === 200,
    `the SAME seeded ids now check in successfully: ${checkin2.status}${startedUncovered ? " (402 -> 200)" : ""}`,
  );
  const att = (await q(
    `select id, status from attendance_records where session_id=$1 and student_id=$2`,
    [seeded.session_id, lina],
  )) as { id: string; status: string }[];
  assert(att.length === 1, `exactly one attendance record written for the seeded session (${att[0]?.status})`);

  // =====================================================================
  section("F3 — checkout on a seeded course");
  // =====================================================================
  const idem = "h03-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const checkout = await call("POST", "/api/v1/subscriptions/checkout", linaSession, {
    courseId: seededOther.course_id,
    plan: "per_session",
    sessionId: seededOther.session_id, // NOT the session F2 already covered
    method: "card",
    payFrom: "gateway",
    idempotencyKey: idem,
  });
  assert(!isUuidValidationError(checkout), `no "Invalid UUID" 400 on courseId/sessionId — got ${checkout.status}`);
  assert(checkout.status === 201, `checkout created a payment intent (201) — got ${checkout.status} ${checkout.text}`);
  const intentId = (D(checkout) as { intentId?: string; id?: string } | undefined) ?? {};
  const iid = intentId.intentId ?? intentId.id ?? null;
  assert(!!iid && uuid.safeParse(iid).success, `intent id returned and is itself a valid uuid: ${iid}`);

  const initiate = await call("POST", "/api/v1/payments/initiate", linaSession, {
    courseId: seeded.course_id,
    method: "card",
    idempotencyKey: idem + "-b",
  });
  assert(
    !isUuidValidationError(initiate),
    `payments/initiate accepts the seeded courseId — got ${initiate.status}`,
  );

  // =====================================================================
  section("F4 — messaging on the seeded demo users");
  // =====================================================================
  const conv = await call("POST", "/api/v1/messages/conversations", youssefSession, {
    recipientId: msgKamal,
  });
  assert(!isUuidValidationError(conv), `no "Invalid UUID" 400 on the seeded recipientId — got ${conv.status}`);
  assert(
    conv.status === 200 || conv.status === 201,
    `student -> own teacher conversation opened: ${conv.status} ${conv.status >= 400 ? conv.text : ""}`,
  );
  const convId = (D(conv) as { id?: string } | undefined)?.id ?? null;
  assert(!!convId && uuid.safeParse(convId).success, `conversation id is a valid uuid: ${convId}`);

  if (seededConv) {
    const report = await call("POST", "/api/v1/messages/reports", youssefSession, {
      conversationId: seededConv.id,
      category: "other",
      details: "h03 proof — seeded conversation id must validate",
    });
    assert(
      !isUuidValidationError(report),
      `report against a SEEDED conversation id validates — got ${report.status}`,
    );
    assert(report.status === 201, `report filed on the seeded thread: ${report.status} ${report.text}`);
    createdReports.push(...((await q(
      `select id from conversation_reports where reporter_id=$1 and details like $2`,
      [msgYoussef, "%h03 proof%"],
    )) as { id: string }[]).map((r) => r.id));
  } else {
    assert(false, "expected a seeded conversation for the messaging demo student");
  }

  // =====================================================================
  section("F5 — the guard is intact: a legacy-shaped id is still REJECTED");
  // =====================================================================
  // The exact id the verification report quoted for the NILE completed session.
  const legacy = "8a0f946b-50c3-2304-1d26-fecd09ce863d";
  assert(!uuid.safeParse(legacy).success, "the legacy seed id still fails z.uuid() (nothing was relaxed)");
  const rejected = await call("POST", "/api/v1/center/checkin", receptionSession, {
    studentId: lina,
    sessionId: legacy,
  });
  assert(
    isUuidValidationError(rejected),
    `the route still answers 400 "Invalid UUID" for a non-RFC id: ${rejected.status} ${rejected.text}`,
  );
  const rejectedMsg = await call("POST", "/api/v1/messages/conversations", youssefSession, {
    recipientId: "2dfbea05-4c2b-21de-66c7-1da369e7a5a9",
  });
  assert(
    isUuidValidationError(rejectedMsg),
    `messages/conversations still rejects a non-RFC id: ${rejectedMsg.status}`,
  );

  // =====================================================================
  section("F6 — cleanup: the ledger returns to its pre-run baseline");
  // =====================================================================
  await cleanup(subId, seeded, seededOther, lina, iid, convId);
  const notifNew = (
    (await q(`select id from notifications where user_id = any($1::uuid[])`, [actors])) as {
      id: string;
    }[]
  )
    .map((r) => r.id)
    .filter((id) => !notifBefore.has(id));
  if (notifNew.length) await pool.query(`delete from notifications where id = any($1::uuid[])`, [notifNew]);
  const notifAfter = (await q(`select count(*)::int n from notifications where user_id = any($1::uuid[])`, [
    actors,
  ])) as { n: number }[];
  assert(
    notifAfter[0]!.n === notifBefore.size,
    `notifications: ${notifBefore.size} -> ${notifAfter[0]!.n} (${notifNew.length} fanned out by the flows, removed)`,
  );

  const after = await snapMoney();
  for (const k of ["t", "p", "w", "s", "ss", "pi", "pl"] as const) {
    assert(after[k] === baseline[k], `${k}: ${baseline[k]} -> ${after[k]} (restored)`);
  }
  const wAfter = (
    await q(
      `select (select wallet_balance from centers where id=$1)::int c,
              (select wallet_balance from teacher_profiles where user_id=$2)::int t,
              (select wallet_balance from student_profiles where user_id=$3)::int s`,
      [seeded.center_id, seeded.teacher_id, lina],
    )
  )[0] as Record<string, number>;
  for (const k of ["c", "t", "s"] as const) {
    assert(wAfter[k] === wBefore[k], `wallet ${k}: ${wBefore[k]} -> ${wAfter[k]} (restored)`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

const createdReports: string[] = [];

async function cleanup(
  subId: string | null,
  seeded: Record<string, string>,
  seededOther: Record<string, string>,
  studentId: string,
  intentId: string | null,
  convId: string | null,
) {
  // Raw SQL through the admin pool: the ledger tables are append-only behind
  // the Prisma immutability extension, and this is a test fixture teardown on a
  // dev database — same escape hatch the C-01 suite uses.
  const del = async (sql: string, p: unknown[]) => {
    try {
      await pool.query(sql, p);
    } catch (e) {
      console.error("  cleanup:", (e as Error).message);
    }
  };
  if (subId) {
    await del(`delete from transactions where notes like $1`, [`%subscription ${subId}%`]);
    await del(`delete from wallet_ledger where subscription_id=$1`, [subId]);
  }
  await del(`delete from attendance_records where session_id=$1 and student_id=$2`, [
    seeded.session_id,
    studentId,
  ]);
  await del(`delete from payments where course_id=$1 and student_id=$2 and note like $3`, [
    seeded.course_id,
    studentId,
    "%",
  ]);
  if (subId) await del(`delete from subscriptions where id=$1`, [subId]);
  // The gateway checkout in F3 creates the coverage row up front in
  // `pending_payment` alongside the intent — it is only activated when the
  // gateway settles, so it has to be cleaned up explicitly too.
  await del(
    `delete from subscriptions where student_id=$1 and course_id=$2 and session_id=$3 and status='pending_payment'`,
    [studentId, seededOther.course_id, seededOther.session_id],
  );
  if (intentId) await del(`delete from payment_intents where id=$1`, [intentId]);
  await del(
    `delete from payment_intents where student_id=$1 and course_id=$2 and status='pending'`,
    [studentId, seeded.course_id],
  );
  await del(`delete from points_ledger where student_id=$1 and created_at > now() - interval '10 minutes'`, [
    studentId,
  ]);
  for (const rid of createdReports) await del(`delete from conversation_reports where id=$1`, [rid]);
  // The conversation the test opened (only if it was NOT a pre-seeded thread).
  if (convId) {
    const seededIds = (await q(`select id from conversations where is_demo = true`)) as { id: string }[];
    if (!seededIds.some((r) => r.id === convId)) {
      await del(`delete from conversation_messages where conversation_id=$1`, [convId]);
      await del(`delete from conversations where id=$1`, [convId]);
    }
  }
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite h03-seed-uuid-flows.test.ts" })
  .then(() => main()).catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* */
  }
  process.exit(1);
});
