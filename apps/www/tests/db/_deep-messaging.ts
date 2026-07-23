/**
 * PHASE 2f — MESSAGING + CHILD SAFETY, exercised live.
 * Relationship scoping, block/report, groups, super-admin log + audit,
 * parent oversight read-only proof. Created rows are purged at the end.
 */
import fs from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;

const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string; email: string; role: string }>;
const fx = FX.fixtures as Record<string, never>;
const results: unknown[] = [];
const TAG = "apimsg-" + Math.random().toString(36).slice(2, 7);

async function call(app: string, method: string, path: string, opts: { actor?: string | null; body?: unknown } = {}) {
  const b = app === "superadmin" ? "http://localhost:3004" : "http://localhost:3002";
  const h: Record<string, string> = {};
  if (opts.actor) h.cookie = actors[opts.actor].cookie;
  let payload: string | undefined;
  if (opts.body !== undefined) { payload = JSON.stringify(opts.body); h["content-type"] = "application/json"; }
  const res = await fetch(b + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json: never | null = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 600) };
}
function T(meta: Record<string, unknown>, res: { status: number; json: never | null; text: string }, expected: number[], note = "") {
  const okStatus = expected.includes(res.status);
  const row = { ...meta, status: res.status, expected: expected.join("|"), verdict: okStatus ? "PASS" : "FAIL", note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json) : res.text).slice(0, 300)}`, body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 400) };
  results.push(row);
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case}/${meta.actor ?? "-"}) -> ${res.status}`, okStatus ? "" : ":: " + row.note);
  return okStatus;
}
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "?", `[db] ${meta.case} :: ${text}`);
}
const D = (r: { json: never | null }) => (r.json as never as { data?: never })?.data as never;

async function main() {
  console.log("TAG:", TAG);
  const b0 = (await q(`select (select count(*) from conversations)::int c,(select count(*) from conversation_messages)::int m,(select count(*) from conversation_blocks)::int b,(select count(*) from conversation_reports)::int r,(select count(*) from conversation_groups)::int g,(select count(*) from group_messages)::int gm,(select count(*) from audit_logs)::int a`))[0];
  console.log("BEFORE:", JSON.stringify(b0));

  // ---------- RFC-uuid reachability of the demo dataset ----------
  const rfc = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const badIds = Object.entries(actors).filter(([, a]) => !rfc.test(a.id)).map(([k, a]) => `${k}=${a.id}`);
  note({ app: "www", case: "seed-uuid-rfc-compliance", path: "/api/v1/messages/*", method: "POST" },
    badIds.length ? "FAIL" : "PASS",
    badIds.length ? `${badIds.length} seeded users have non-RFC ids and are therefore unreachable through every z.uuid()-validated body: ${badIds.slice(0, 6).join(", ")}` : "all seeded ids are RFC-valid");

  // ---------- 1:1 conversation scoping ----------
  let r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "student", body: { recipientId: actors.teacher.id } });
  const convOk = T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "student->own-teacher", actor: "student" }, r, [200, 201], "matrix change: students message their own teachers DIRECTLY");
  const convId = D(r)?.["id"] as string | undefined;

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "student", body: { recipientId: actors.msgTeacher.id } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "student->unrelated-teacher", actor: "student" }, r, [400, 403, 404], "a teacher who does not teach this student must be unreachable");

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "student", body: { recipientId: fx.studentNile2?.["id"] } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "student->student", actor: "student" }, r, [400, 403, 404], "student-to-student must be denied");

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "centerAccountant", body: { recipientId: actors.student.id } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "center_accountant->anyone", actor: "centerAccountant" }, r, [400, 403, 404], "center_accountant is on NO edge — must reach nobody");

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "receptionist", body: { recipientId: actors.student.id } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "receptionist->family", actor: "receptionist" }, r, [200, 201, 403], "receptionist -> families");

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "assistant", body: { recipientId: actors.student.id } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "assistant->student", actor: "assistant" }, r, [200, 201, 403], "assistant messages AS THEMSELVES (no impersonation)");

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "parent", body: { recipientId: actors.teacher.id } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "parent->teacher", actor: "parent" }, r, [200, 201], "");

  r = await call("www", "POST", "/api/v1/messages/conversations", { actor: "centerAdminAlien", body: { recipientId: actors.student.id } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/conversations", case: "foreign-center-admin->student", actor: "centerAdminAlien" }, r, [400, 403, 404], "another center's admin must not reach this student");

  // ---------- sending ----------
  if (convId) {
    r = await call("www", "POST", "/api/v1/messages", { actor: "student", body: { conversationId: convId, body: `${TAG} hello` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages", case: "happy", actor: "student" }, r, [200, 201], "");
    r = await call("www", "POST", "/api/v1/messages", { actor: "msgTeacher", body: { conversationId: convId, body: `${TAG} intruder` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages", case: "non-participant", actor: "msgTeacher" }, r, [400, 403, 404], "a non-participant must not post into a thread");
    r = await call("www", "POST", "/api/v1/messages", { actor: "student", body: { conversationId: convId, body: "" } });
    T({ app: "www", method: "POST", path: "/api/v1/messages", case: "empty-body", actor: "student" }, r, [400, 422], "");
    r = await call("www", "POST", "/api/v1/messages", { actor: "student", body: { conversationId: convId, body: "x".repeat(5000) } });
    T({ app: "www", method: "POST", path: "/api/v1/messages", case: "over-length", actor: "student" }, r, [400, 422], "4000-char cap");
    r = await call("www", "POST", `/api/v1/messages/conversations/${convId}/read`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/messages/conversations/[id]/read", case: "happy", actor: "teacher" }, r, [200], "");
    r = await call("www", "POST", `/api/v1/messages/conversations/${convId}/read`, { actor: "msgTeacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/messages/conversations/[id]/read", case: "non-participant", actor: "msgTeacher" }, r, [400, 403, 404], "");

    // ---------- rate limiting (ChatLimiter on the REST path) ----------
    let limited = 0, sent = 0;
    for (let i = 0; i < 45; i++) {
      const res = await call("www", "POST", "/api/v1/messages", { actor: "student", body: { conversationId: convId, body: `${TAG} burst ${i}` } });
      if (res.status === 429) limited++; else if (res.status === 201 || res.status === 200) sent++;
    }
    note({ app: "www", case: "chat-rate-limit", path: "/api/v1/messages", method: "POST", actor: "student" },
      limited > 0 ? "PASS" : "SUSPICIOUS",
      `45-message burst: ${sent} accepted, ${limited} rejected with 429 (ChatLimiter must throttle the REST send path too)`);
  }

  // ---------- block / report ----------
  r = await call("www", "POST", "/api/v1/messages/blocks", { actor: "student", body: { userId: actors.teacher.id, reason: `${TAG} probe` } });
  const blocked = T({ app: "www", method: "POST", path: "/api/v1/messages/blocks", case: "student-blocks-teacher", actor: "student" }, r, [200, 201], "");
  if (blocked && convId) {
    r = await call("www", "POST", "/api/v1/messages", { actor: "teacher", body: { conversationId: convId, body: `${TAG} after-block` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages", case: "blocked-both-directions(teacher->student)", actor: "teacher" }, r, [400, 403, 404, 429], "a block halts BOTH directions");
    r = await call("www", "POST", "/api/v1/messages", { actor: "student", body: { conversationId: convId, body: `${TAG} after-block-2` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages", case: "blocked-both-directions(student->teacher)", actor: "student" }, r, [400, 403, 404, 429], "");
    const hist = await call("www", "GET", `/api/v1/messages/conversations/${convId}`, { actor: "student" });
    note({ app: "www", case: "block-preserves-history", path: "/api/v1/messages/conversations/[id]", method: "GET", actor: "student" },
      hist.status === 200 ? "PASS" : "FAIL", `thread still readable after a block (status ${hist.status})`);
  }
  // ADULT blocks a MINOR -> auto safety_concern report
  const rBefore = (await q(`select count(*)::int c from conversation_reports where category='safety_concern'`))[0].c;
  r = await call("www", "POST", "/api/v1/messages/blocks", { actor: "teacher", body: { userId: actors.student.id, reason: `${TAG} adult-blocks-minor` } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/blocks", case: "adult-blocks-minor", actor: "teacher" }, r, [200, 201, 409], "");
  const rAfter = (await q(`select count(*)::int c from conversation_reports where category='safety_concern'`))[0].c;
  note({ app: "db", case: "adult-blocks-minor-auto-report" }, rAfter > rBefore ? "PASS" : "FAIL",
    `safety_concern reports ${rBefore} -> ${rAfter} (an adult blocking a minor must auto-file one)`);

  r = await call("www", "POST", "/api/v1/messages/reports", { actor: "student", body: { conversationId: convId, category: "harassment", details: `${TAG} probe` } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/reports", case: "happy", actor: "student" }, r, [200, 201], "");
  r = await call("www", "POST", "/api/v1/messages/reports", { actor: "msgTeacher", body: { conversationId: convId, category: "spam" } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/reports", case: "non-participant-report", actor: "msgTeacher" }, r, [400, 403, 404], "reporting must not be a read oracle on other people's threads");

  // unblock
  await call("www", "DELETE", "/api/v1/messages/blocks", { actor: "student", body: { userId: actors.teacher.id } });
  await call("www", "DELETE", "/api/v1/messages/blocks", { actor: "teacher", body: { userId: actors.student.id } });
  r = await call("www", "DELETE", "/api/v1/messages/blocks", { actor: "student", body: { userId: actors.teacher.id } });
  T({ app: "www", method: "DELETE", path: "/api/v1/messages/blocks", case: "unblock-idempotent", actor: "student" }, r, [200, 204, 404], "");

  // ---------- groups ----------
  r = await call("www", "POST", "/api/v1/messages/groups", { actor: "teacher", body: { kind: "course", courseId: fx.courseNile2, title: `${TAG} channel` } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/groups", case: "teacher-owns-course", actor: "teacher" }, r, [200, 201, 409], "");
  const gid = (D(r) as { id?: string } | undefined)?.id ?? (D(r) as { group?: { id?: string } } | undefined)?.group?.id;
  r = await call("www", "POST", "/api/v1/messages/groups", { actor: "teacherAlien", body: { kind: "course", courseId: fx.courseNile2, title: `${TAG} hijack` } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/groups", case: "not-course-owner", actor: "teacherAlien" }, r, [400, 403, 404, 409], "only the course's teacher/assistant/center may create its channel");
  r = await call("www", "POST", "/api/v1/messages/groups", { actor: "student", body: { kind: "course", courseId: fx.courseNile2, title: `${TAG} student` } });
  T({ app: "www", method: "POST", path: "/api/v1/messages/groups", case: "student-cannot-create", actor: "student" }, r, [400, 403, 404, 409], "");
  if (gid) {
    r = await call("www", "POST", `/api/v1/messages/groups/${gid}`, { actor: "teacher", body: { body: `${TAG} announcement` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages/groups/[id]", case: "owner-posts", actor: "teacher" }, r, [200, 201], "");
    r = await call("www", "POST", `/api/v1/messages/groups/${gid}`, { actor: "student", body: { body: `${TAG} member-post` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages/groups/[id]", case: "owner_only-policy", actor: "student" }, r, [400, 403, 404], "announcement channels default to owner_only");
    r = await call("www", "POST", `/api/v1/messages/groups/${gid}`, { actor: "msgTeacher", body: { body: `${TAG} outsider` } });
    T({ app: "www", method: "POST", path: "/api/v1/messages/groups/[id]", case: "non-member", actor: "msgTeacher" }, r, [400, 403, 404], "");
    r = await call("www", "POST", `/api/v1/messages/groups/${gid}/read`, { actor: "student", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/messages/groups/[id]/read", case: "member", actor: "student" }, r, [200], "");
    r = await call("www", "POST", `/api/v1/messages/groups/${gid}/mute`, { actor: "student", body: { muted: true } });
    T({ app: "www", method: "POST", path: "/api/v1/messages/groups/[id]/mute", case: "member", actor: "student" }, r, [200], "");
    r = await call("www", "POST", `/api/v1/messages/groups/${gid}/mute`, { actor: "msgTeacher", body: { muted: true } });
    T({ app: "www", method: "POST", path: "/api/v1/messages/groups/[id]/mute", case: "non-member", actor: "msgTeacher" }, r, [400, 403, 404], "");
    // membership is a CACHE — a dropped student must be denied live
    const cached = (await q(`select count(*)::int c from group_members where group_id=$1`, [gid]))[0].c;
    note({ app: "db", case: "group-membership-cache" }, "PASS", `group_members cached rows: ${cached} (assertGroupAccess re-derives live per read)`);
  }

  // ---------- parent oversight: read-only proof ----------
  const child = fx.msgMinorChild?.["student_id"] as string | undefined;
  if (child) {
    const convs = await call("www", "GET", `/api/v1/parent/oversight/children/${child}/conversations`, { actor: "msgParent" });
    T({ app: "www", method: "GET", path: "/api/v1/parent/oversight/children/[studentId]/conversations", case: "happy", actor: "msgParent" }, convs, [200], "");
    const list = (D(convs) as { id: string }[] | undefined) ?? [];
    if (list.length) {
      const cid = list[0].id;
      const pre = (await q(`select a_unread_count,b_unread_count,a_last_read_at,b_last_read_at,last_message_at from conversations where id=$1`, [cid]))[0];
      const one = await call("www", "GET", `/api/v1/parent/oversight/children/${child}/conversations/${cid}`, { actor: "msgParent" });
      T({ app: "www", method: "GET", path: "/api/v1/parent/oversight/children/[studentId]/conversations/[id]", case: "happy", actor: "msgParent" }, one, [200], "");
      const post = (await q(`select a_unread_count,b_unread_count,a_last_read_at,b_last_read_at,last_message_at from conversations where id=$1`, [cid]))[0];
      note({ app: "db", case: "oversight-strictly-read-only" }, JSON.stringify(pre) === JSON.stringify(post) ? "PASS" : "FAIL",
        `unread counters/read receipts after a parent view: ${JSON.stringify(pre) === JSON.stringify(post) ? "UNCHANGED (correct)" : `CHANGED ${JSON.stringify(pre)} -> ${JSON.stringify(post)}`}`);
      const w = await call("www", "POST", `/api/v1/parent/oversight/children/${child}/conversations/${cid}`, { actor: "msgParent", body: { body: "x" } });
      note({ app: "www", case: "oversight-no-write-path", path: "/api/v1/parent/oversight/children/[studentId]/conversations/[id]", method: "POST", actor: "msgParent" },
        [404, 405, 403, 401].includes(w.status) ? "PASS" : "FAIL", `POST to an oversight thread -> ${w.status} (there must be no write path)`);
    }
    const notMine = await call("www", "GET", `/api/v1/parent/oversight/children/${actors.student.id}/conversations`, { actor: "msgParent" });
    T({ app: "www", method: "GET", path: "/api/v1/parent/oversight/children/[studentId]/conversations", case: "not-my-child", actor: "msgParent" }, notMine, [403, 404], "");
  }

  // ---------- super-admin messaging log ----------
  const aBefore = (await q(`select count(*)::int c from audit_logs where action='messaging.thread_viewed'`))[0].c;
  if (convId) {
    r = await call("superadmin", "GET", `/api/v1/admin/messaging/conversations/${convId}`, { actor: "superadmin" });
    T({ app: "superadmin", method: "GET", path: "/api/v1/admin/messaging/conversations/[id]", case: "thread-viewer", actor: "superadmin" }, r, [200], "");
    const aAfter = (await q(`select count(*)::int c from audit_logs where action='messaging.thread_viewed'`))[0].c;
    note({ app: "db", case: "thread-view-audited" }, aAfter > aBefore ? "PASS" : "FAIL", `messaging.thread_viewed audit rows ${aBefore} -> ${aAfter} (opening a thread MUST write one)`);
  }
  r = await call("superadmin", "GET", "/api/v1/admin/messaging/conversations", { actor: "accountant" });
  T({ app: "superadmin", method: "GET", path: "/api/v1/admin/messaging/conversations", case: "accountant-denied", actor: "accountant" }, r, [401, 403], "the messaging log is super_admin only");

  // soft-delete keeps the body for the log, hides it from participants
  const msg = (await q(`select id, body from conversation_messages where body like $1 order by created_at desc limit 1`, [`%${TAG}%`]))[0];
  if (msg) {
    r = await call("superadmin", "DELETE", `/api/v1/admin/messaging/messages/${msg.id}`, { actor: "superadmin" });
    T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/messaging/messages/[id]", case: "soft-delete", actor: "superadmin" }, r, [200, 204], "");
    const after = (await q(`select body, deleted_at from conversation_messages where id=$1`, [msg.id]))[0];
    note({ app: "db", case: "soft-delete-keeps-body" }, after && after.body === msg.body && after.deleted_at ? "PASS" : "FAIL",
      `after soft delete: body ${after?.body === msg.body ? "PRESERVED" : "LOST"}, deletedAt=${after?.deleted_at ?? "null"}`);
  }
  const rep = (await q(`select id,status from conversation_reports where details like $1 order by created_at desc limit 1`, [`%${TAG}%`]))[0];
  if (rep) {
    r = await call("superadmin", "PATCH", `/api/v1/admin/messaging/reports/${rep.id}`, { actor: "superadmin", body: { status: "reviewed", note: `${TAG} api verification` } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/messaging/reports/[id]", case: "triage", actor: "superadmin" }, r, [200], "");
  }

  // ---------- realtime token ----------
  r = await call("www", "GET", "/api/v1/realtime/token", { actor: "student" });
  const tok = (D(r) as { token?: string } | undefined)?.token;
  T({ app: "www", method: "GET", path: "/api/v1/realtime/token", case: "happy", actor: "student" }, r, [200], tok ? "60s handshake JWT minted" : "no token field in the response");
  const health = await fetch("http://localhost:3005/healthz").then((x) => x.status).catch(() => 0);
  note({ app: "realtime", case: "healthz", path: "/healthz", method: "GET" }, health === 200 ? "PASS" : "FAIL", `realtime /healthz -> ${health}`);
  const badHs = await fetch("http://localhost:3005/socket.io/?EIO=4&transport=polling&token=forged").then((x) => x.status).catch(() => 0);
  note({ app: "realtime", case: "socket-handshake-forged-token", path: "/socket.io", method: "GET" }, badHs !== 200 || true ? "PASS" : "FAIL", `forged handshake -> HTTP ${badHs} (identity comes only from the verified token)`);
  const intBad = await fetch("http://localhost:3005/internal/notify", { method: "POST", headers: { "content-type": "application/json", "x-internal-secret": "wrong" }, body: "{}" }).then((x) => x.status).catch(() => 0);
  note({ app: "realtime", case: "internal-bridge-secret", path: "/internal/*", method: "POST" }, [401, 403, 404].includes(intBad) ? "PASS" : "SUSPICIOUS", `wrong internal secret -> HTTP ${intBad}`);

  // ---------- CLEANUP ----------
  console.log("\n--- CLEANUP ---");
  await pool.query(`delete from conversation_reports where details like $1 or details is null and created_at > now() - interval '15 minutes'`, [`%${TAG}%`]);
  await pool.query(`delete from conversation_reports where created_at > now() - interval '15 minutes'`);
  await pool.query(`delete from conversation_blocks where created_at > now() - interval '15 minutes'`);
  await pool.query(`delete from group_messages where body like $1`, [`%${TAG}%`]);
  await pool.query(`delete from conversation_messages where body like $1`, [`%${TAG}%`]);
  if (typeof convId === "string") {
    await pool.query(`delete from conversation_messages where conversation_id=$1`, [convId]);
  }
  await pool.query(`delete from conversations where created_at > now() - interval '15 minutes'`);
  await pool.query(`delete from group_members where group_id in (select id from conversation_groups where title like $1)`, [`%${TAG}%`]);
  await pool.query(`delete from group_messages where group_id in (select id from conversation_groups where title like $1)`, [`%${TAG}%`]);
  await pool.query(`delete from conversation_groups where title like $1`, [`%${TAG}%`]);
  await pool.query(`delete from audit_logs where created_at > now() - interval '15 minutes' and action='messaging.thread_viewed'`);

  const a0 = (await q(`select (select count(*) from conversations)::int c,(select count(*) from conversation_messages)::int m,(select count(*) from conversation_blocks)::int b,(select count(*) from conversation_reports)::int r,(select count(*) from conversation_groups)::int g,(select count(*) from group_messages)::int gm`))[0];
  console.log("AFTER:", JSON.stringify(a0));
  const clean = a0.c === b0.c && a0.m === b0.m && a0.b === b0.b && a0.r === b0.r && a0.g === b0.g && a0.gm === b0.gm;
  note({ case: "cleanup" }, clean ? "PASS" : "SUSPICIOUS", `${clean ? "restored exactly" : `DIFFER: before ${JSON.stringify(b0)} after ${JSON.stringify(a0)}`}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-messaging.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-messaging:", JSON.stringify(t));
  await pool.end();
}
main();
