/**
 * PHASE 2j — bound the blast radius of the session-completion 500
 * (centers_wallet_balance_nonneg violated by a NEGATIVE centerNet).
 * Three variants: no room / with room+split / center wallet pre-funded.
 * DISCLOSURE: money ledger writes on fresh demo entities; fully purged after.
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
const TAG = "apip6-" + Math.random().toString(36).slice(2, 7);
const courses: string[] = [];

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
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: meta.status ?? 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : verdict === "SKIP" ? "-" : "?", `${meta.case} :: ${text}`);
}
const D = (r: { json: never | null }) => (r.json as never as { data?: never })?.data as never;
const snap = async () => (await q(`select (select count(*) from transactions)::int t,(select count(*) from session_settlements)::int ss,(select count(*) from payments)::int p,(select count(*) from subscriptions)::int s,(select count(*) from courses)::int c,(select count(*) from sessions)::int se,(select count(*) from wallet_ledger)::int w`))[0];

async function purge() {
  for (const cid of courses) {
    await pool.query(`delete from session_settlements where course_id=$1`, [cid]);
    await pool.query(`delete from attendance_records where course_id=$1`, [cid]);
    await pool.query(`delete from transactions where lesson_id in (select id from sessions where course_id=$1)`, [cid]);
    await pool.query(`delete from wallet_ledger where subscription_id in (select id from subscriptions where course_id=$1)`, [cid]);
    await pool.query(`delete from payments where course_id=$1`, [cid]);
    await pool.query(`delete from subscriptions where course_id=$1`, [cid]);
    await pool.query(`delete from payment_intents where course_id=$1`, [cid]);
    await pool.query(`delete from enrollments where course_id=$1`, [cid]);
    await pool.query(`delete from group_messages where group_id in (select id from conversation_groups where course_id=$1)`, [cid]);
    await pool.query(`delete from group_members where group_id in (select id from conversation_groups where course_id=$1)`, [cid]);
    await pool.query(`delete from conversation_groups where course_id=$1`, [cid]);
    await pool.query(`delete from sessions where course_id=$1`, [cid]);
    await pool.query(`delete from courses where id=$1`, [cid]);
  }
  await pool.query(`delete from wallet_ledger where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from transactions where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from payments where created_at > now() - interval '25 minutes'`);
  await pool.query(`update student_profiles set wallet_balance=0 where user_id=$1`, [actors.student.id]);
  await pool.query(`update teacher_profiles set wallet_balance=0 where user_id=$1`, [actors.teacher.id]);
  await pool.query(`update centers set wallet_balance=0, receipt_seq=0 where id=$1`, [fx.centerNile]);
  await pool.query(`delete from center_teacher_affiliations where id=$1 and false`, ["00000000-0000-4000-8000-000000000000"]);
}

async function variant(label: string, opts: { roomId?: string; prefundCenter?: number; startHour: string }) {
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    teacherId: actors.teacher.id, title: `${TAG} ${label}`, subject: "Math", price: 20000, maxStudents: 20,
    schedulePattern: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: opts.startHour, endTime: `0${Number(opts.startHour.slice(0, 2)) + 1}:00`.slice(-5), startDate: start, endDate: end },
  };
  if (opts.roomId) { body.defaultRoomId = opts.roomId; body.pricingMethod = "whole_room_percent"; }
  let r = await call("www", "POST", "/api/v1/courses", { actor: "centerAdmin", body });
  if (r.status !== 201 && r.status !== 200) { note({ case: `${label}: create` }, "SKIP", `course create -> ${r.status}: ${r.text.slice(0, 160)}`); return; }
  const cid = ((D(r) as { id?: string } | undefined)?.id) as string;
  courses.push(cid);
  await call("www", "PATCH", `/api/v1/courses/${cid}`, { actor: "centerAdmin", body: { pricePerSession: 5000, pricePerMonth: 20000 } });
  const sess = (await q(`select id from sessions where course_id=$1 order by date limit 1`, [cid]))[0];
  await call("www", "POST", "/api/v1/enrollments", { actor: "centerAdmin", body: { studentId: actors.student.id, courseId: cid } });
  r = await call("www", "POST", "/api/v1/center/subscriptions", { actor: "receptionist", body: { studentId: actors.student.id, courseId: cid, plan: "per_session", sessionId: sess.id, markAttendance: true } });
  if (r.status >= 400) { note({ case: `${label}: walk-in cash` }, "FAIL", `-> ${r.status}: ${r.text.slice(0, 160)}`); return; }
  await call("www", "POST", "/api/v1/center/checkin", { actor: "receptionist", body: { studentId: actors.student.id, sessionId: sess.id } });
  // the DOOR stage is what turns counter_only into a PRESENT attendee
  await call("www", "PATCH", "/api/v1/teacher/attendance-mode", { actor: "teacher", body: { mode: "counter_and_door" } });
  const door = await call("www", "POST", "/api/v1/door-checkin", { actor: "assistant", body: { studentId: actors.student.id, sessionId: sess.id } });
  const attRows = await q(`select status from attendance_records where session_id=$1`, [sess.id]);
  note({ case: `${label}: attendance` }, attRows.some((a: { status: string }) => a.status === "present") ? "PASS" : "SUSPICIOUS",
    `door check-in -> ${door.status}; attendance ${JSON.stringify(attRows)}`);

  if (opts.prefundCenter) await pool.query(`update centers set wallet_balance=$2 where id=$1`, [fx.centerNile, opts.prefundCenter]);

  const cw = (await q(`select wallet_balance from centers where id=$1`, [fx.centerNile]))[0].wallet_balance;
  const before = await snap();
  r = await call("www", "POST", `/api/v1/sessions/${sess.id}/complete`, { actor: "teacher", body: {} });
  const after = await snap();
  const ok = r.status === 200 || r.status === 201;
  note({ app: "www", case: `${label}: POST /api/v1/sessions/[id]/complete`, path: "/api/v1/sessions/[id]/complete", method: "POST", actor: "teacher", status: r.status },
    ok ? "PASS" : "FAIL",
    `center wallet before=${cw} -> HTTP ${r.status}${ok ? "" : ": " + (r.json ? JSON.stringify((r.json as { error?: { message?: string } }).error?.message) : r.text).slice(0, 200)}; transactions ${before.t}->${after.t}, settlements ${before.ss}->${after.ss}`);
  if (ok) {
    const rows = await q(`select type,amount,notes from transactions where lesson_id=$1 order by created_at`, [sess.id]);
    const w = (await q(`select (select coalesce(wallet_balance,0)::int from centers where id=$1) c,(select coalesce(wallet_balance,0)::int from teacher_profiles where user_id=$2) t`, [fx.centerNile, actors.teacher.id]))[0];
    note({ case: `${label}: ledger` }, "PASS", `${rows.length} rows ${JSON.stringify(rows)}; center wallet=${w.c}, teacher wallet=${w.t}`);
  }
}

async function main() {
  console.log("TAG:", TAG);
  const base = await snap();
  console.log("BASELINE:", JSON.stringify(base));
  const fees = (await q(`select platform_teacher_fee, platform_center_fee, center_share_bp from commission_settings where scope='global' limit 1`))[0];
  note({ case: "global commission config" }, "PASS", JSON.stringify(fees));

  await variant("V1 no-room (centerShare=0)", { startHour: "03:00" });
  await purge(); courses.length = 0;
  await variant("V2 with-room (whole_room_percent)", { roomId: (fx.roomNile as unknown as { id: string })?.id, startHour: "04:00" });
  await purge(); courses.length = 0;
  await variant("V3 no-room, center wallet pre-funded", { prefundCenter: 100000, startHour: "05:00" });
  await purge(); courses.length = 0;

  const after = await snap();
  console.log("AFTER:", JSON.stringify(after));
  note({ case: "cleanup" }, JSON.stringify(after) === JSON.stringify(base) ? "PASS" : "SUSPICIOUS", `${JSON.stringify(base)} -> ${JSON.stringify(after)}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-probe-6.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-probe-6:", JSON.stringify(t));
  await pool.end();
}
main().catch(async (e) => { console.error("FATAL", e); await purge(); await pool.end(); });
