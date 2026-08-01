/**
 * C-01 PROOF — session completion must settle a no-room course without ever
 * driving a wallet under the H2 floor.
 *
 * BEFORE the fix, `distributeSessionRevenue` computed
 *     centerNet = centerShare − platformCenterFee
 * for the legacy no-room branch. With the DEFAULT centerShare of 0 (collaboration
 * requests force 0 per decision #3; POST /api/v1/courses never sets one) and the
 * global platformCenterFee of 200, that is −200 — a wallet DEBIT. The H2
 * `centers_wallet_balance_nonneg` CHECK refused it, the whole settlement
 * transaction rolled back, and the endpoint answered 500. The lesson could never
 * be settled and the teacher was never paid. A brand-new center's wallet is 0, so
 * this fired on its very FIRST lesson.
 *
 * AFTER the fix both nets are non-negative BY CONSTRUCTION via the shared
 * `computeNoRoomLessonSplit` (see its doc comment for the money semantics).
 *
 * This test drives the REAL route handlers IN-PROCESS against the REAL database
 * — no service-layer shortcuts, only the session read is stubbed (via the
 * `__setSessionOverrideForTests` seam in @/lib/auth/session) — and asserts:
 *   P1  a brand-new center (wallet 0) completes its FIRST lesson              -> 200
 *   P2  money reconciles EXACTLY: ledger rows == wallet deltas, nothing lost
 *   P3  exactly-once still holds (replayed completion writes nothing)
 *   P4  the H2 floor is NOT weakened (constraints still validated + enforced)
 *   P5  a correctly-configured no-room course is BYTE-IDENTICAL to the old math
 *   P6  the room-based (Method 1) branch is untouched
 *   P7  MOVED -> apps/superadmin/tests/db/c01-zero-wallet-refund.test.ts
 *
 * Everything it creates is deleted at the end and the table counts are asserted
 * back to the pre-run baseline.
 *
 * WHY IN-PROCESS: this suite used to POST to http://localhost:3002 and :3004 —
 * whatever servers held those ports. Its writes then travelled on THOSE servers'
 * connections, where db-guard could not see them; proven 2026-08-01, when
 * running it with `--env-file=.env.test` created a center and a user in DEV
 * while the guard correctly read `test`. In-process, the only connection is this
 * process's own — the one db-guard validates. No server is required.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only c01-lesson-settlement
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { computeNoRoomLessonSplit } from "@repo/server-core/services/finance/fees";

import type { SessionUser } from "@/lib/auth/session";
import { __setSessionOverrideForTests } from "@/lib/auth/session";
import { POST as coursesRoute } from "@/app/api/v1/courses/route";
import { PATCH as courseByIdRoute } from "@/app/api/v1/courses/[id]/route";
import { POST as enrollmentsRoute } from "@/app/api/v1/enrollments/route";
import { POST as centerSubscriptionsRoute } from "@/app/api/v1/center/subscriptions/route";
import { PATCH as attendanceModeRoute } from "@/app/api/v1/teacher/attendance-mode/route";
import { POST as doorCheckinRoute } from "@/app/api/v1/door-checkin/route";
import { POST as sessionCompleteRoute } from "@/app/api/v1/sessions/[id]/complete/route";
import { POST as registerCenterRoute } from "@/app/api/v1/auth/register/center/route";
import { POST as centerStaffRoute } from "@/app/api/v1/center/staff/route";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;

const TAG = "c01-" + Math.random().toString(36).slice(2, 7);
const PW = "C01Proof123";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}
function section(s: string) { console.log("\n" + s); }

// ------------------------------------------------------------------- session
// IN-PROCESS. The ONLY thing stubbed is the cookie -> session read at the very
// edge (`__setSessionOverrideForTests` in @/lib/auth/session — the explicit
// test seam that replaced the old getServerSession monkey-patch). The authz
// wrappers, zod, the settlement services and every DB write are the real code
// path — and the only connection in play is this process's own, the one
// db-guard validates. See the docblock for why that matters here.
let currentSession: { user: SessionUser } | null = null;
__setSessionOverrideForTests(() => currentSession?.user ?? null);

export type Session = { user: SessionUser };

/** The www session a given user would carry, resolved from the DB row. */
async function sessionFor(userId: string): Promise<Session> {
  const u = (await q(`select u.id,u.email,u.name,u.role,u.locale,
      (select cap.center_id from center_admin_profiles cap where cap.user_id=u.id limit 1) admin_center,
      (select cs.center_id from center_staff cs where cs.staff_user_id=u.id and cs.removed_at is null limit 1) staff_center
    from users u where u.id=$1`, [userId]))[0];
  return {
    user: {
      id: u.id, role: u.role, email: u.email, name: u.name,
      centerId: u.admin_center ?? u.staff_center ?? undefined, locale: u.locale,
    } as SessionUser,
  };
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * path -> the REAL route handler. Dynamic segments are matched by a regex so
 * `/api/v1/courses/<uuid>` reaches courses/[id] with `params.id` populated,
 * exactly as Next would. An unmatched path throws — a typo must be a loud
 * failure, not a silent 404 that reads like a rejected request.
 */
const ROUTES: { method: string; pattern: RegExp; handler: Handler; keys: string[] }[] = [
  { method: "POST", pattern: /^\/api\/v1\/courses$/, handler: coursesRoute as Handler, keys: [] },
  { method: "PATCH", pattern: /^\/api\/v1\/courses\/([^/]+)$/, handler: courseByIdRoute as Handler, keys: ["id"] },
  { method: "POST", pattern: /^\/api\/v1\/enrollments$/, handler: enrollmentsRoute as Handler, keys: [] },
  { method: "POST", pattern: /^\/api\/v1\/center\/subscriptions$/, handler: centerSubscriptionsRoute as Handler, keys: [] },
  { method: "PATCH", pattern: /^\/api\/v1\/teacher\/attendance-mode$/, handler: attendanceModeRoute as Handler, keys: [] },
  { method: "POST", pattern: /^\/api\/v1\/door-checkin$/, handler: doorCheckinRoute as Handler, keys: [] },
  { method: "POST", pattern: /^\/api\/v1\/sessions\/([^/]+)\/complete$/, handler: sessionCompleteRoute as Handler, keys: ["id"] },
  { method: "POST", pattern: /^\/api\/v1\/auth\/register\/center$/, handler: registerCenterRoute as Handler, keys: [] },
  { method: "POST", pattern: /^\/api\/v1\/center\/staff$/, handler: centerStaffRoute as Handler, keys: [] },
];

/** A distinct IP per call so the shared rate-limit buckets never starve the run. */
const nextIp = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

async function call(method: string, path: string, session?: Session, body?: unknown) {
  const route = ROUTES.find((r) => r.method === method && r.pattern.test(path));
  if (!route) throw new Error(`c01: no in-process handler registered for ${method} ${path}`);
  const m = route.pattern.exec(path) as RegExpExecArray;
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));

  const h: Record<string, string> = { "x-forwarded-for": nextIp() };
  let payload: string | undefined;
  if (body !== undefined) { payload = JSON.stringify(body); h["content-type"] = "application/json"; }
  currentSession = session ?? null;
  try {
    const res = await route.handler(
      new Request(`http://localhost${path}`, { method, headers: h, body: payload }),
      { params: Promise.resolve(params) },
    );
    const text = await res.text();
    let json: never | null = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, json, text: text.slice(0, 400) };
  } finally {
    currentSession = null;
  }
}
const D = (r: { json: never | null }) => (r.json as never as { data?: never })?.data as never;

/**
 * The MONEY tables only. Deliberately excludes users/centers/courses: other
 * suites in this directory (messaging-scope.test.ts et al.) leave their own
 * fixtures behind, so a global row count is not a stable baseline. What this
 * test must prove is that IT leaves no money row and no row of its own — see
 * the two cleanup assertions.
 */
const snap = async () => (await q(`select (select count(*) from transactions)::int t,(select count(*) from payments)::int p,
  (select count(*) from wallet_ledger)::int w,(select count(*) from subscriptions)::int s,
  (select count(*) from session_settlements)::int ss,(select count(*) from payment_intents)::int pi`))[0];

const wallets = async (centerId: string, teacherId: string) =>
  (await q(`select (select wallet_balance from centers where id=$1)::int c,
                   (select wallet_balance from teacher_profiles where user_id=$2)::int t`, [centerId, teacherId]))[0];

const created: { centers: string[]; users: string[]; courses: string[] } = { centers: [], users: [], courses: [] };

async function purge() {
  for (const cid of created.courses) {
    // The walk-in cash subscription mirrors to a `payment` transaction that
    // carries NO lesson_id (it is subscription revenue, not lesson revenue), so
    // it has to be reached through the subscription id before the subscription
    // row itself is deleted.
    const subs = await q(`select id from subscriptions where course_id=$1`, [cid]);
    for (const s of subs as { id: string }[]) {
      try { await pool.query(`delete from transactions where notes like $1`, [`%subscription ${s.id}%`]); } catch { /* */ }
      try { await pool.query(`delete from wallet_ledger where subscription_id=$1`, [s.id]); } catch { /* */ }
    }
    for (const sql of [
      `delete from session_settlements where course_id=$1`, `delete from attendance_records where course_id=$1`,
      `delete from transactions where lesson_id in (select id from sessions where course_id=$1)`,
      `delete from wallet_ledger where subscription_id in (select id from subscriptions where course_id=$1)`,
      `delete from payments where course_id=$1`, `delete from subscriptions where course_id=$1`,
      `delete from payment_intents where course_id=$1`, `delete from enrollments where course_id=$1`,
      `delete from group_messages where group_id in (select id from conversation_groups where course_id=$1)`,
      `delete from group_members where group_id in (select id from conversation_groups where course_id=$1)`,
      `delete from conversation_groups where course_id=$1`, `delete from sessions where course_id=$1`,
      `delete from courses where id=$1`,
    ]) { try { await pool.query(sql, [cid]); } catch { /* */ } }
  }
  for (const uid of created.users) {
    for (const [t, col] of [["center_admin_profiles", "user_id"], ["teacher_profiles", "user_id"], ["student_profiles", "user_id"],
      ["center_student_rosters", "student_id"], ["enrollments", "student_id"], ["notifications", "user_id"],
      ["user_prefs", "user_id"], ["audit_logs", "actor_id"], ["center_teacher_affiliations", "teacher_id"]] as [string, string][]) {
      try { await pool.query(`delete from ${t} where ${col}=$1`, [uid]); } catch { /* */ }
    }
    try { await pool.query(`delete from users where id=$1`, [uid]); } catch { /* */ }
  }
  for (const cid of created.centers) {
    for (const t of ["center_staff", "center_admin_profiles", "center_student_rosters", "center_teacher_affiliations",
      "center_stages", "rooms", "commission_settings", "transactions", "payments"]) {
      try { await pool.query(`delete from ${t} where center_id=$1`, [cid]); } catch { /* */ }
    }
    try { await pool.query(`delete from centers where id=$1`, [cid]); } catch { /* */ }
  }
  await pool.query(`delete from wallet_ledger where reason like $1`, [`%${TAG}%`]);
  await pool.query(`delete from transactions where notes like $1`, [`%${TAG}%`]);
}

/** Build a settled lesson end-to-end and return the observed money. */
async function settleLesson(opts: {
  label: string; centerId: string; adminSession: Session; teacherId: string;
  teacherSession: Session; studentId: string; receptionSession: Session;
  assistantSession?: Session; withRoom?: string; centerShare?: number | null; price: number;
}) {
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const hh = String(2 + created.courses.length).padStart(2, "0");
  const body: Record<string, unknown> = {
    teacherId: opts.teacherId, title: `${TAG} ${opts.label}`, subject: "Math",
    price: opts.price, maxStudents: 20,
    schedulePattern: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: `${hh}:00`, endTime: `${String(Number(hh) + 1).padStart(2, "0")}:00`, startDate: start, endDate: end },
  };
  if (opts.withRoom) { body.defaultRoomId = opts.withRoom; body.pricingMethod = "whole_room_percent"; }
  let r = await call("POST", "/api/v1/courses", opts.adminSession, body);
  if (r.status !== 201 && r.status !== 200) return { error: `course create -> ${r.status}: ${r.text}` };
  const courseId = (D(r) as { id?: string }).id as string;
  created.courses.push(courseId);

  if (opts.centerShare != null) {
    await pool.query(`update center_teacher_affiliations set center_share=$3 where teacher_id=$1 and center_id=$2`,
      [opts.teacherId, opts.centerId, opts.centerShare]);
  }
  await call("PATCH", `/api/v1/courses/${courseId}`, opts.adminSession, { pricePerSession: 5000, pricePerMonth: 20000 });
  const sess = (await q(`select id from sessions where course_id=$1 order by date limit 1`, [courseId]))[0];
  const plannedSessions = (await q(`select count(*)::int c from sessions where course_id=$1`, [courseId]))[0].c;
  await call("POST", "/api/v1/enrollments", opts.adminSession, { studentId: opts.studentId, courseId });
  await call("POST", "/api/v1/center/subscriptions", opts.receptionSession,
    { studentId: opts.studentId, courseId, plan: "per_session", sessionId: sess.id, markAttendance: true });
  await call("PATCH", "/api/v1/teacher/attendance-mode", opts.teacherSession, { mode: "counter_and_door" });
  await call("POST", "/api/v1/door-checkin", opts.assistantSession ?? opts.teacherSession, { studentId: opts.studentId, sessionId: sess.id });
  const present = (await q(`select count(*)::int c from attendance_records where session_id=$1 and status='present'`, [sess.id]))[0].c;

  const before = await wallets(opts.centerId, opts.teacherId);
  const b = await snap();
  const complete = await call("POST", `/api/v1/sessions/${sess.id}/complete`, opts.teacherSession, {});
  const after = await wallets(opts.centerId, opts.teacherId);
  const a = await snap();
  const ledger = await q(`select type,amount,from_entity_id,to_entity_id,notes from transactions where lesson_id=$1 order by created_at,ref_number`, [sess.id]);

  return {
    courseId, sessionId: sess.id, plannedSessions, present, complete,
    perSessionPrice: Math.round(opts.price / plannedSessions),
    walletsBefore: before, walletsAfter: after, ledger,
    txnDelta: a.t - b.t, settlementDelta: a.ss - b.ss,
  };
}

async function main() {
  console.log("C-01 PROOF — no-room lesson settlement vs the H2 wallet floor —", TAG);
  const base = await snap();
  console.log("BASELINE:", JSON.stringify(base));

  // Resolved, never pasted: a demo purge + re-seed gives NILE a fresh
  // gen_random_uuid(), and `superadmin.demo@edura.eg` was a legacy is_demo
  // account that no current seed recreates (seed.ts mints staff from the
  // SEED_SUPERADMIN_* env vars instead). short_id and role are stable.
  const NILE = (await q(`select id from centers where short_id='NILE'`))[0]?.id as string;
  if (!NILE) throw new Error("NILE center missing — run packages/database/prisma/preview-seed.ts");
  const teacherId = (await q(`select id from users where email='hossam.aziz@nile-academy.eg'`))[0].id;
  const teacherSession = await sessionFor(teacherId);
  const assistantId = (await q(`select id from users where email='sara.fawzy@nile-academy.eg'`))[0].id;
  const assistantSession = await sessionFor(assistantId);
  const studentId = (await q(`select id from users where email='lina.hassan@student.nile-academy.eg'`))[0].id;
  const nileAdminId = (await q(`select id from users where email='admin@nile-academy.eg'`))[0].id;
  const nileAdminSession = await sessionFor(nileAdminId);
  const nileReceptionId = (await q(`select id from users where email='reception@nile-academy.eg'`))[0].id;
  const nileReceptionSession = await sessionFor(nileReceptionId);
  const nileRoom = (await q(`select id from rooms where center_id=$1 and is_active=true limit 1`, [NILE]))[0].id;
  const fees = (await q(`select platform_teacher_fee::int tf, platform_center_fee::int cf from commission_settings where scope='global'`))[0];
  const origShare = (await q(`select center_share from center_teacher_affiliations where teacher_id=$1 and center_id=$2`, [teacherId, NILE]))[0]?.center_share ?? null;
  console.log(`global fees: teacher-side=${fees.tf}, center-side=${fees.cf}`);

  // =====================================================================
  section("P4 — the H2 floor is NOT weakened (checked BEFORE and AFTER)");
  // =====================================================================
  const checks = await q(`select conrelid::regclass::text tbl, conname, convalidated from pg_constraint
     where conname in ('centers_wallet_balance_nonneg','teacher_profiles_wallet_balance_nonneg','student_profiles_wallet_balance_nonneg')`);
  assert(checks.length === 3, `all 3 wallet_balance >= 0 CHECK constraints still exist (${checks.length}/3)`);
  assert(checks.every((c: { convalidated: boolean }) => c.convalidated), "all 3 CHECKs are VALIDATED (not NOT VALID)");
  let floorHeld = false;
  try {
    await pool.query(`update centers set wallet_balance = -1 where id=$1`, [NILE]);
  } catch (e) { floorHeld = /wallet_balance_nonneg/.test((e as Error).message); }
  assert(floorHeld, "a direct attempt to drive a center wallet to -1 is STILL rejected by the DB");
  assert(Number((await q(`select wallet_balance from centers where id=$1`, [NILE]))[0].wallet_balance) >= 0, "the center wallet is still >= 0");

  // =====================================================================
  section("P1 — a BRAND-NEW center with a ZERO wallet completes its FIRST lesson");
  // =====================================================================
  let r = await call("POST", "/api/v1/auth/register/center", undefined, {
    centerName: `${TAG} Fresh Center`, adminName: `${TAG} Owner`,
    email: `${TAG}-owner@c01proof.test`, password: PW, locale: "en",
  });
  assert(r.status === 201, `a new center registers -> ${r.status}`);
  const newCenterId = (D(r) as { center?: { id?: string } }).center?.id as string;
  const newAdminId = (D(r) as { user?: { id?: string } }).user?.id as string;
  created.centers.push(newCenterId); created.users.push(newAdminId);

  // FIXTURE, not an assertion. Approving a center and affiliating a teacher are
  // apps/superadmin operations, and a superadmin service cannot be imported here:
  // its own `@/lib/...` imports would resolve against apps/www/src, where files
  // of the SAME NAME exist — so it would silently run www's platformDb and
  // notify. Proven 2026-08-01, and unacceptable in a money proof. Those two
  // operations are covered in-process on their own side
  // (apps/superadmin/tests/db/center-platform.test.ts); what C-01 needs from
  // them is only the resulting STATE, written here directly.
  await pool.query(`update centers set status='active' where id=$1`, [newCenterId]);
  // Same shape linkTeacherCenter writes: active, responded now, one-year expiry.
  await pool.query(
    `insert into center_teacher_affiliations
       (id, center_id, teacher_id, status, responded_at, expires_at, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, 'active', now(), now() + interval '1 year', now(), now())
     on conflict do nothing`,
    [newCenterId, teacherId],
  );
  assert(
    (await q(`select status from centers where id=$1`, [newCenterId]))[0].status === "active",
    "the new center is active (fixture: approval state)",
  );
  assert(
    (await q(`select 1 from center_teacher_affiliations where teacher_id=$1 and center_id=$2 and status='active'`,
      [teacherId, newCenterId])).length === 1,
    "the teacher is affiliated to the new center (fixture: link state)",
  );

  const freshWallet = Number((await q(`select wallet_balance from centers where id=$1`, [newCenterId]))[0].wallet_balance);
  assert(freshWallet === 0, `the new center's wallet is ${freshWallet} (zero — the exact C-01 precondition)`);
  const freshShare = (await q(`select center_share from center_teacher_affiliations where teacher_id=$1 and center_id=$2`, [teacherId, newCenterId]))[0]?.center_share;
  assert(freshShare == null || Number(freshShare) === 0, `the affiliation's centerShare is ${freshShare ?? "NULL"} (the default — the other C-01 precondition)`);

  await pool.query(`update users set status='active' where id=$1`, [newAdminId]);
  const newAdminSession = await sessionFor(newAdminId);
  // give the new center a receptionist so the counter path is identical
  r = await call("POST", "/api/v1/center/staff", newAdminSession,
    { name: `${TAG} Desk`, email: `${TAG}-desk@c01proof.test`, password: PW, role: "receptionist" });
  const deskUserId = (D(r) as { staffUserId?: string; user?: { id?: string } })?.staffUserId ?? (D(r) as { user?: { id?: string } })?.user?.id;
  if (deskUserId) created.users.push(deskUserId as string);
  const deskSession = deskUserId ? await sessionFor(deskUserId as string) : newAdminSession;
  await pool.query(`insert into center_student_rosters (id,center_id,student_id,added_at,created_at,updated_at)
     values (gen_random_uuid(),$1,$2,now(),now(),now()) on conflict do nothing`, [newCenterId, studentId]);

  const p1 = await settleLesson({
    label: "fresh no-room", centerId: newCenterId, adminSession: newAdminSession, teacherId,
    teacherSession, studentId, receptionSession: deskSession, assistantSession, price: 20000, centerShare: null,
  });
  if ("error" in p1) { assert(false, `P1 setup failed: ${p1.error}`); }
  else {
    assert(p1.present === 1, `one student is PRESENT for the lesson (${p1.present})`);
    assert(p1.complete.status === 200, `POST /api/v1/sessions/[id]/complete -> ${p1.complete.status} (was 500 with centers_wallet_balance_nonneg)`);
    assert(!/wallet_balance_nonneg/.test(p1.complete.text), "the response carries NO wallet-floor violation");
    assert(p1.ledger.length === 3, `the settlement wrote ${p1.ledger.length} ledger rows (payment + 2 commissions)`);

    // ---- P2 conservation ----
    section("P2 — the money reconciles EXACTLY");
    const expected = computeNoRoomLessonSplit(p1.perSessionPrice, 0, { platformTeacherFee: fees.tf, platformCenterFee: fees.cf });
    const teacherNet = p1.perSessionPrice - expected.fees.platformTeacherFee - expected.centerShare;
    const centerNet = expected.centerShare - expected.fees.platformCenterFee;
    const dTeacher = p1.walletsAfter.t - p1.walletsBefore.t;
    const dCenter = p1.walletsAfter.c - p1.walletsBefore.c;
    const paymentRow = p1.ledger.find((x: { type: string }) => x.type === "payment");
    const commissionTotal = p1.ledger.filter((x: { type: string }) => x.type === "commission")
      .reduce((s: number, x: { amount: number }) => s + Number(x.amount), 0);
    console.log(`   price/session=${p1.perSessionPrice} centerShare=${expected.centerShare} fees={t:${expected.fees.platformTeacherFee},c:${expected.fees.platformCenterFee}} -> teacherNet=${teacherNet} centerNet=${centerNet}`);
    console.log(`   wallet deltas: teacher ${p1.walletsBefore.t}->${p1.walletsAfter.t} (${dTeacher}), center ${p1.walletsBefore.c}->${p1.walletsAfter.c} (${dCenter})`);
    assert(teacherNet >= 0 && centerNet >= 0, `both nets are non-negative (teacher ${teacherNet}, center ${centerNet})`);
    assert(dTeacher === teacherNet, `the teacher wallet moved by exactly teacherNet (${dTeacher} == ${teacherNet}) — the teacher IS paid`);
    assert(dCenter === centerNet, `the center wallet moved by exactly centerNet (${dCenter} == ${centerNet})`);
    assert(Number(paymentRow.amount) === p1.perSessionPrice, `the payment row equals the per-session price (${paymentRow.amount})`);
    assert(dTeacher + dCenter + commissionTotal === Number(paymentRow.amount),
      `CONSERVATION: teacher(${dTeacher}) + center(${dCenter}) + platform(${commissionTotal}) == price(${paymentRow.amount}) — no piaster created or destroyed`);
    assert(Number(p1.walletsAfter.c) >= 0 && Number(p1.walletsAfter.t) >= 0, "both beneficiary wallets are still >= 0");

    // ---- P3 exactly-once ----
    section("P3 — exactly-once still holds");
    const b3 = await snap();
    const replay = await call("POST", `/api/v1/sessions/${p1.sessionId}/complete`, teacherSession, {});
    const a3 = await snap();
    const w3 = await wallets(newCenterId, teacherId);
    assert(a3.t === b3.t, `replaying the completion wrote NO extra transactions (${b3.t} -> ${a3.t})`);
    assert(a3.ss === b3.ss, `replaying wrote NO extra session_settlements (${b3.ss} -> ${a3.ss})`);
    assert(w3.t === p1.walletsAfter.t && w3.c === p1.walletsAfter.c, "replaying moved NEITHER wallet — the distributedAt claim still gates");
    assert([200, 201, 409, 422].includes(replay.status), `the replay answered ${replay.status} (never a 500)`);

    // ---- P7 lives in apps/superadmin now ----
    // The refund round-trip against a ZERO-wallet center moved to
    // apps/superadmin/tests/db/c01-zero-wallet-refund.test.ts. It is not dropped
    // and not weakened — `refundLessonForStudent` exists ONLY in apps/superadmin
    // (it is not a server-core shim like commission/distribution/fees), so it
    // cannot be imported here without binding to www's same-named modules. The
    // suite that owns that service now owns the assertions too.
  }

  // =====================================================================
  section("P5 — a CORRECTLY-CONFIGURED no-room course is byte-identical to the old math");
  // =====================================================================
  const p5 = await settleLesson({
    label: "configured no-room", centerId: NILE, adminSession: nileAdminSession, teacherId,
    teacherSession, studentId, receptionSession: nileReceptionSession, assistantSession,
    price: 80000, centerShare: 1000,
  });
  if ("error" in p5) assert(false, `P5 setup failed: ${p5.error}`);
  else {
    // The PRE-FIX formula, computed here independently.
    const oldCenterShare = 1000;
    const oldTeacherNet = p5.perSessionPrice - fees.tf - oldCenterShare;
    const oldCenterNet = oldCenterShare - fees.cf;
    const dT = p5.walletsAfter.t - p5.walletsBefore.t;
    const dC = p5.walletsAfter.c - p5.walletsBefore.c;
    console.log(`   price/session=${p5.perSessionPrice} centerShare=${oldCenterShare} -> old teacherNet=${oldTeacherNet}, old centerNet=${oldCenterNet}`);
    assert(p5.complete.status === 200, `a properly configured no-room course completes -> ${p5.complete.status}`);
    assert(oldTeacherNet >= 0 && oldCenterNet >= 0, "the old formula was already non-negative here, so no clamp should bite");
    assert(dT === oldTeacherNet, `teacher wallet delta is IDENTICAL to the pre-fix formula (${dT} == ${oldTeacherNet})`);
    assert(dC === oldCenterNet, `center wallet delta is IDENTICAL to the pre-fix formula (${dC} == ${oldCenterNet})`);
    const notes = p5.ledger.map((x: { notes: string }) => x.notes).join(" | ");
    assert(!/capped to the lesson's value/.test(notes), "no clamp note was written — the ledger text is unchanged for configured courses");
  }

  // =====================================================================
  section("P6 — the room-based (Method 1) branch is untouched");
  // =====================================================================
  const p6 = await settleLesson({
    label: "room based", centerId: NILE, adminSession: nileAdminSession, teacherId,
    teacherSession, studentId, receptionSession: nileReceptionSession, assistantSession,
    withRoom: nileRoom, price: 20000, centerShare: null,
  });
  if ("error" in p6) assert(false, `P6 setup failed: ${p6.error}`);
  else {
    const dT = p6.walletsAfter.t - p6.walletsBefore.t;
    const dC = p6.walletsAfter.c - p6.walletsBefore.c;
    const split = (await q(`select split_platform_bp::int p, split_teacher_bp::int t, split_center_bp::int c from courses where id=$1`, [p6.courseId]))[0];
    const expPlatform = Math.round((p6.perSessionPrice * split.p) / 10_000);
    const expCenter = Math.round((p6.perSessionPrice * split.c) / 10_000);
    const expTeacher = p6.perSessionPrice - expPlatform - expCenter;
    console.log(`   split snapshot ${JSON.stringify(split)} price/session=${p6.perSessionPrice}`);
    assert(p6.complete.status === 200, `the room-based course completes -> ${p6.complete.status}`);
    assert(dT === expTeacher, `teacher wallet delta follows the frozen split (${dT} == ${expTeacher})`);
    assert(dC === expCenter, `center wallet delta follows the frozen split (${dC} == ${expCenter})`);
    const commissionTotal = p6.ledger.filter((x: { type: string }) => x.type === "commission")
      .reduce((s: number, x: { amount: number }) => s + Number(x.amount), 0);
    assert(dT + dC + commissionTotal === p6.perSessionPrice, `CONSERVATION on the room path (${dT}+${dC}+${commissionTotal} == ${p6.perSessionPrice})`);
  }

  // =====================================================================
  section("P4b — the H2 floor is STILL intact after all of the above");
  // =====================================================================
  const negs = (await q(`select (select count(*) from centers where wallet_balance<0)::int c,
    (select count(*) from teacher_profiles where wallet_balance<0)::int t,
    (select count(*) from student_profiles where wallet_balance<0)::int s`))[0];
  assert(negs.c === 0 && negs.t === 0 && negs.s === 0,
    `no wallet anywhere is negative (centers ${negs.c}, teachers ${negs.t}, students ${negs.s})`);
  // NAME the three, do not pattern-match. `like '%wallet_balance_nonneg%'` used
  // to be a false green: the parent-wallet migration added a FOURTH constraint,
  // so parent+student+teacher alone satisfied "3/3" while
  // `centers_wallet_balance_nonneg` — the one this entire suite is about — could
  // sit NOT VALID unnoticed. It was doing exactly that on the test branch.
  const checks2 = await q(`select count(*)::int c from pg_constraint
     where conname in ('centers_wallet_balance_nonneg','teacher_profiles_wallet_balance_nonneg','student_profiles_wallet_balance_nonneg')
       and convalidated`);
  assert(checks2[0].c === 3, `all 3 CHECKs remain present and validated (${checks2[0].c}/3) — the fix did NOT weaken H2`);

  // =====================================================================
  section("CLEANUP");
  // =====================================================================
  await purge();
  await pool.query(`update center_teacher_affiliations set center_share=$3 where teacher_id=$1 and center_id=$2`, [teacherId, NILE, origShare]);
  await pool.query(`update teacher_profiles set attendance_mode='counter_only' where user_id=$1`, [teacherId]);
  await pool.query(`update student_profiles set wallet_balance=0 where user_id=$1`, [studentId]);
  await pool.query(`update teacher_profiles set wallet_balance=0 where user_id=$1`, [teacherId]);
  await pool.query(`update centers set wallet_balance=0, receipt_seq=0 where id=$1`, [NILE]);
  await pool.query(`delete from center_student_rosters where student_id=$1 and center_id = any($2::uuid[])`, [studentId, created.centers]);
  const after = await snap();
  console.log("AFTER:", JSON.stringify(after));
  assert(JSON.stringify(after) === JSON.stringify(base),
    `every MONEY table is back to baseline (${JSON.stringify(base)} -> ${JSON.stringify(after)})`);
  const mine = (await q(`select
      (select count(*) from users where email like $1 or name like $2)::int u,
      (select count(*) from centers where name like $2)::int c,
      (select count(*) from courses where title like $2)::int co,
      (select count(*) from transactions where notes like $2)::int t,
      (select count(*) from wallet_ledger where reason like $2)::int w`,
    [`%c01proof.test`, `%${TAG}%`]))[0];
  assert(mine.u === 0 && mine.c === 0 && mine.co === 0 && mine.t === 0 && mine.w === 0,
    `this test left NOTHING of its own behind (${JSON.stringify(mine)})`);

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite c01-lesson-settlement.test.ts" })
  .then(() => main()).catch(async (e) => { console.error("FATAL", e); await purge(); await pool.end(); process.exit(1); });
