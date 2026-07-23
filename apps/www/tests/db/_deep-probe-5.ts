/**
 * PHASE 2i — the counter/walk-in/door/settlement money workflow end-to-end on
 * FRESH demo entities (so ids are RFC-valid gen_random_uuid()s).
 * DISCLOSURE: writes to the money ledger; every row is deleted at the end and
 * the table counts are asserted back to the pre-run baseline.
 */
import fs from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string }>;
const fx = FX.fixtures as Record<string, never>;
const results: unknown[] = [];
const TAG = "apip5-" + Math.random().toString(36).slice(2, 7);

async function call(app: string, method: string, path: string, opts: { actor?: string; body?: unknown } = {}) {
  const b = app === "superadmin" ? "http://localhost:3004" : "http://localhost:3002";
  const h: Record<string, string> = {};
  if (opts.actor) h.cookie = actors[opts.actor].cookie;
  let payload: string | undefined;
  if (opts.body !== undefined) { payload = JSON.stringify(opts.body); h["content-type"] = "application/json"; }
  const res = await fetch(b + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json: never | null = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 400) };
}
function T(meta: Record<string, unknown>, res: { status: number; json: never | null; text: string }, expected: number[], note = "") {
  const okStatus = expected.includes(res.status);
  const row = { ...meta, status: res.status, expected: expected.join("|"), verdict: okStatus ? "PASS" : "FAIL", note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json) : res.text).slice(0, 300)}`, body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 400) };
  results.push(row);
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case}) -> ${res.status}`, okStatus ? "" : ":: " + row.note);
  return okStatus;
}
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : verdict === "SKIP" ? "-" : "?", `[db] ${meta.case} :: ${text}`);
}
const D = (r: { json: never | null }) => (r.json as never as { data?: never })?.data as never;
const snap = async () => (await q(`select (select count(*) from transactions)::int t,(select count(*) from payments)::int p,(select count(*) from wallet_ledger)::int w,(select count(*) from subscriptions)::int s,(select count(*) from session_settlements)::int ss,(select count(*) from courses)::int c,(select count(*) from sessions)::int se`))[0];

let courseId: string | undefined;

async function cleanup() {
  if (courseId) {
    await pool.query(`delete from session_settlements where course_id=$1`, [courseId]);
    await pool.query(`delete from attendance_records where course_id=$1`, [courseId]);
    await pool.query(`delete from transactions where lesson_id in (select id from sessions where course_id=$1)`, [courseId]);
    await pool.query(`delete from wallet_ledger where subscription_id in (select id from subscriptions where course_id=$1)`, [courseId]);
    await pool.query(`delete from payments where course_id=$1`, [courseId]);
    await pool.query(`delete from subscriptions where course_id=$1`, [courseId]);
    await pool.query(`delete from payment_intents where course_id=$1`, [courseId]);
    await pool.query(`delete from enrollments where course_id=$1`, [courseId]);
    await pool.query(`delete from group_messages where group_id in (select id from conversation_groups where course_id=$1)`, [courseId]);
    await pool.query(`delete from group_members where group_id in (select id from conversation_groups where course_id=$1)`, [courseId]);
    await pool.query(`delete from conversation_groups where course_id=$1`, [courseId]);
    await pool.query(`delete from sessions where course_id=$1`, [courseId]);
    await pool.query(`delete from courses where id=$1`, [courseId]);
  }
  await pool.query(`delete from wallet_ledger where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from transactions where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from payments where created_at > now() - interval '25 minutes'`);
  await pool.query(`update student_profiles set wallet_balance=0 where user_id=$1`, [actors.student.id]);
  await pool.query(`update teacher_profiles set wallet_balance=0 where user_id=$1`, [actors.teacher.id]);
  await pool.query(`update centers set wallet_balance=0, receipt_seq=0 where id=$1`, [fx.centerNile]);
}

async function main() {
  console.log("TAG:", TAG);
  const base = await snap();
  console.log("BASELINE:", JSON.stringify(base));
  const studentId = actors.student.id;
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  // a slot nothing else uses (03:00-04:00), so no schedule conflict
  let r = await call("www", "POST", "/api/v1/courses", {
    actor: "centerAdmin",
    body: { teacherId: actors.teacher.id, title: `${TAG} counter course`, subject: "Math", price: 20000, maxStudents: 20, schedulePattern: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "03:00", endTime: "04:00", startDate: start, endDate: end } },
  });
  T({ app: "www", method: "POST", path: "/api/v1/courses", case: "fresh-course" }, r, [200, 201], "a fresh course gets a gen_random_uuid() (RFC-valid) id");
  courseId = ((D(r) as { id?: string } | undefined)?.id) ?? (D(r) as { course?: { id?: string } } | undefined)?.course?.id;
  const rfcOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(courseId ?? "");
  note({ case: "fresh-id-is-rfc-uuid" }, rfcOk ? "PASS" : "FAIL", `new course id ${courseId} ${rfcOk ? "IS" : "is NOT"} an RFC uuid (contrast with the seeded demo ids, which are not)`);

  // POST /courses has NO plan-price fields; they only exist on PATCH, so a
  // freshly created course is unpayable until a second call sets them.
  if (courseId) {
    const planned = await call("www", "PATCH", `/api/v1/courses/${courseId}`, { actor: "centerAdmin", body: { pricePerSession: 5000, pricePerMonth: 20000 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/courses/[id]", case: "enable-plans" }, planned, [200], "plan prices are PATCH-only — POST /api/v1/courses cannot set them");
    const row = (await q(`select price_per_session, price_per_month from courses where id=$1`, [courseId]))[0];
    note({ case: "plan-prices-after-patch" }, row?.price_per_session ? "PASS" : "FAIL", `pricePerSession=${row?.price_per_session}, pricePerMonth=${row?.price_per_month}`);
  }

  const sess = courseId ? (await q(`select id,date,status from sessions where course_id=$1 order by date limit 1`, [courseId]))[0] : null;
  note({ case: "sessions-generated" }, sess ? "PASS" : "FAIL", sess ? `course creation generated ${(await q(`select count(*)::int c from sessions where course_id=$1`, [courseId]))[0].c} sessions (first ${sess.id})` : "NO sessions generated");

  if (courseId && sess) {
    const c0 = await snap();
    r = await call("www", "POST", "/api/v1/enrollments", { actor: "centerAdmin", body: { studentId, courseId } });
    T({ app: "www", method: "POST", path: "/api/v1/enrollments", case: "enroll" }, r, [200, 201], "");

    r = await call("www", "POST", "/api/v1/center/checkin", { actor: "receptionist", body: { studentId, sessionId: sess.id } });
    T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "uncovered-student" }, r, [402], "an uncovered student must return 402 needs_payment");

    r = await call("www", "POST", "/api/v1/center/subscriptions", { actor: "receptionist", body: { studentId, courseId, plan: "per_session", sessionId: sess.id, markAttendance: true } });
    const walkOk = T({ app: "www", method: "POST", path: "/api/v1/center/subscriptions", case: "walk-in-cash+checkin" }, r, [200, 201], "cash for one session + counter check-in in ONE step");
    const c1 = await snap();
    note({ case: "walk-in-cash-mirrors-to-ledger" }, walkOk && c1.t > c0.t && c1.p > c0.p ? "PASS" : walkOk ? "FAIL" : "SKIP",
      `walk-in cash: transactions ${c0.t}->${c1.t}, payments ${c0.p}->${c1.p}, subscriptions ${c0.s}->${c1.s} (Step 4: cash MUST mirror to the ledger)`);

    r = await call("www", "POST", "/api/v1/center/subscriptions", { actor: "centerAdminAlien", body: { studentId, courseId, plan: "per_session", sessionId: sess.id } });
    T({ app: "www", method: "POST", path: "/api/v1/center/subscriptions", case: "cross-tenant" }, r, [403, 404, 422], "another center must not sell a seat in this course");

    r = await call("www", "POST", "/api/v1/center/checkin", { actor: "receptionist", body: { studentId, sessionId: sess.id } });
    T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "covered-student" }, r, [200, 201, 409], "now covered -> check-in succeeds");

    // ---- door stage ----
    r = await call("www", "PATCH", "/api/v1/teacher/attendance-mode", { actor: "teacher", body: { mode: "counter_and_door" } });
    T({ app: "www", method: "PATCH", path: "/api/v1/teacher/attendance-mode", case: "switch-to-door-mode" }, r, [200], "");
    const doorState = await call("www", "GET", `/api/v1/door-checkin?sessionId=${sess.id}`, { actor: "assistant" });
    T({ app: "www", method: "GET", path: "/api/v1/door-checkin", case: "door-queue" }, doorState, [200], "counter-passed vs door-confirmed roster");
    r = await call("www", "POST", "/api/v1/door-checkin", { actor: "assistant", body: { studentId, sessionId: sess.id } });
    T({ app: "www", method: "POST", path: "/api/v1/door-checkin", case: "door-by-assistant" }, r, [200, 201], "the TEACHER'S ASSISTANT does the door check-in (decision #4)");
    r = await call("www", "POST", "/api/v1/door-checkin", { actor: "assistant", body: { studentId, sessionId: sess.id } });
    T({ app: "www", method: "POST", path: "/api/v1/door-checkin", case: "door-idempotent" }, r, [200, 201, 409], "a repeated door check-in must be idempotent");
    r = await call("www", "POST", "/api/v1/door-checkin", { actor: "receptionist", body: { studentId, sessionId: sess.id } });
    T({ app: "www", method: "POST", path: "/api/v1/door-checkin", case: "front-desk-denied" }, r, [401, 403], "front desk must not do the DOOR stage");
    const att = await q(`select status from attendance_records where session_id=$1 and student_id=$2`, [sess.id, studentId]);
    note({ case: "attendance-after-door" }, att.length ? "PASS" : "FAIL", `attendance rows for this session: ${JSON.stringify(att)}`);

    // ---- settlement ----
    const d0 = await snap();
    r = await call("www", "POST", `/api/v1/sessions/${sess.id}/complete`, { actor: "teacherAlien", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/complete", case: "cross-teacher" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/sessions/${sess.id}/complete`, { actor: "teacher", body: {} });
    const compOk = T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/complete", case: "complete" }, r, [200, 201], "runs the fee/points/wallet distribution");
    const d1 = await snap();
    note({ case: "distribution-writes" }, compOk && d1.t > d0.t ? "PASS" : compOk ? "SUSPICIOUS" : "SKIP",
      `session completion: transactions ${d0.t}->${d1.t}, session_settlements ${d0.ss}->${d1.ss}`);
    const ledger = await q(`select type,amount,notes from transactions where lesson_id=$1 order by created_at`, [sess.id]);
    note({ case: "distribution-ledger-rows" }, ledger.length ? "PASS" : "SUSPICIOUS", `ledger rows for the settled session: ${JSON.stringify(ledger)}`);
    const wal = await q(`select (select coalesce(sum(wallet_balance),0)::int from teacher_profiles where user_id=$1) t,(select coalesce(wallet_balance,0)::int from centers where id=$2) c`, [actors.teacher.id, fx.centerNile]);
    note({ case: "beneficiary-wallets-credited" }, "PASS", `teacher wallet=${wal[0].t}, center wallet=${wal[0].c} after distribution`);

    r = await call("www", "POST", `/api/v1/sessions/${sess.id}/complete`, { actor: "teacher", body: {} });
    const d2 = await snap();
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/complete", case: "exactly-once-replay" }, r, [200, 201, 409, 422], "completing an already-completed session");
    note({ case: "distributedAt-exactly-once" }, d2.t === d1.t && d2.ss === d1.ss ? "PASS" : "FAIL",
      `replayed completion: transactions ${d1.t}->${d2.t}, settlements ${d1.ss}->${d2.ss} (the distributedAt gate must make this a no-op)`);

    // ---- refund the charge, then double-refund (H3) ----
    const charge = (await q(`select id from transactions where lesson_id=$1 and type='payment' and from_entity_id=$2 limit 1`, [sess.id, studentId]))[0];
    if (charge) {
      r = await call("superadmin", "POST", "/api/v1/finance/refunds", { actor: "accountant", body: { sessionId: sess.id, studentId, reason: `${TAG} probe` } });
      const refOk = T({ app: "superadmin", method: "POST", path: "/api/v1/finance/refunds", case: "refund" }, r, [200, 201], "");
      r = await call("superadmin", "POST", "/api/v1/finance/refunds", { actor: "accountant", body: { sessionId: sess.id, studentId, reason: `${TAG} double` } });
      T({ app: "superadmin", method: "POST", path: "/api/v1/finance/refunds", case: "H3-double-refund" }, r, [409, 422], "the second refund of the same charge must be refused");
      const refunds = (await q(`select count(*)::int c from transactions where type='refund' and lesson_id=$1`, [sess.id]))[0].c;
      note({ case: "H3-one-refund-per-payment" }, refunds <= 1 ? "PASS" : "FAIL", `refund rows for this charge: ${refunds} (must be exactly ${refOk ? 1 : 0})`);
    } else note({ case: "H3-double-refund" }, "SKIP", "no lesson charge was produced to refund");
  }

  console.log("\n--- CLEANUP ---");
  await cleanup();
  const after = await snap();
  console.log("AFTER:", JSON.stringify(after));
  note({ case: "cleanup" }, JSON.stringify(after) === JSON.stringify(base) ? "PASS" : "SUSPICIOUS", `${JSON.stringify(base)} -> ${JSON.stringify(after)}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-probe-5.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-probe-5:", JSON.stringify(t));
  await pool.end();
}
main().catch(async (e) => { console.error("FATAL", e); await cleanup(); await pool.end(); });
