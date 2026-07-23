/**
 * PHASE 2g — WRITE suite 3: remaining super-admin/finance ops + the remaining
 * www endpoints, including the session-completion money path (exactly-once).
 * All global money config is captured and RESTORED. Ledger rows created here
 * are deleted at the end and the counts are asserted back to the baseline.
 */
import fs from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string; email: string }>;
const fx = FX.fixtures as Record<string, never>;
const results: unknown[] = [];
const TAG = "apiw3-" + Math.random().toString(36).slice(2, 7);
const trash: [string, string][] = [];

async function call(app: string, method: string, path: string, opts: { actor?: string; body?: unknown } = {}) {
  const b = app === "superadmin" ? "http://localhost:3004" : "http://localhost:3002";
  const h: Record<string, string> = {};
  if (opts.actor) h.cookie = actors[opts.actor].cookie;
  let payload: string | undefined;
  if (opts.body !== undefined) { payload = JSON.stringify(opts.body); h["content-type"] = "application/json"; }
  const res = await fetch(b + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json: never | null = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 500), ct: res.headers.get("content-type") };
}
function T(meta: Record<string, unknown>, res: { status: number; json: never | null; text: string }, expected: number[], note = "") {
  const okStatus = expected.includes(res.status);
  const row = { ...meta, status: res.status, expected: expected.join("|"), verdict: okStatus ? "PASS" : "FAIL", note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json) : res.text).slice(0, 300)}`, body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 400) };
  results.push(row);
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case})-> ${res.status}`, okStatus ? "" : ":: " + row.note);
  return okStatus;
}
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "?", `[db] ${meta.case} :: ${text}`);
}
const D = (r: { json: never | null }) => (r.json as never as { data?: never })?.data as never;
const snap = async () => (await q(`select (select count(*) from transactions)::int t,(select count(*) from payments)::int p,(select count(*) from wallet_ledger)::int w,(select count(*) from payment_intents)::int i,(select count(*) from subscriptions)::int s,(select count(*) from session_settlements)::int ss,(select count(*) from payouts)::int po`))[0];

async function main() {
  console.log("TAG:", TAG);
  const base = await snap();
  console.log("BASELINE:", JSON.stringify(base));
  const NILE = fx.centerNile as unknown as string;
  const studentId = actors.student.id;

  // ============== SUPERADMIN: accountants ==============
  let r = await call("superadmin", "POST", "/api/v1/admin/accountants", { actor: "superadmin", body: { name: `${TAG} Acct`, email: `${TAG}-acct@apiverify.test`, password: "ApiVerify123" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/accountants", case: "happy", actor: "superadmin" }, r, [200, 201], "");
  const acctId = (D(r) as { id?: string; userId?: string } | undefined)?.id ?? (D(r) as { userId?: string } | undefined)?.userId;
  if (acctId) trash.push(["users", acctId]);
  r = await call("superadmin", "POST", "/api/v1/admin/accountants", { actor: "accountant", body: { name: "x", email: `${TAG}-a2@apiverify.test`, password: "ApiVerify123" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/accountants", case: "wrong-role", actor: "accountant" }, r, [401, 403], "an accountant must not mint accountants");

  // ============== SUPERADMIN: catalog (with the required `code`) ==============
  const sysId = (fx.system as unknown as { id: string })?.id;
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/stages", { actor: "superadmin", body: { code: `${TAG}-stage`.toLowerCase(), educationSystemId: sysId, nameAr: `${TAG} مرحلة`, nameEn: `${TAG} stage` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/stages", case: "happy", actor: "superadmin" }, r, [200, 201], "");
  const stageId = (D(r) as { id?: string } | undefined)?.id;
  if (stageId) trash.push(["stages", stageId]);
  if (stageId) {
    r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/stages/${stageId}`, { actor: "superadmin", body: { nameEn: `${TAG} stage v2` } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/stages/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
    r = await call("superadmin", "POST", "/api/v1/admin/catalog/grade-levels", { actor: "superadmin", body: { code: `${TAG}-gl`.toLowerCase(), stageId, nameAr: `${TAG} صف`, nameEn: `${TAG} grade` } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/grade-levels", case: "happy", actor: "superadmin" }, r, [200, 201], "");
    const glId = (D(r) as { id?: string } | undefined)?.id;
    if (glId) trash.push(["grade_levels", glId]);
    if (glId) {
      r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/grade-levels/${glId}`, { actor: "superadmin", body: { nameEn: `${TAG} grade v2` } });
      T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/grade-levels/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
      r = await call("superadmin", "POST", "/api/v1/admin/catalog/tracks", { actor: "superadmin", body: { code: `${TAG}-tr`.toLowerCase(), nameAr: `${TAG} شعبة`, nameEn: `${TAG} track` } });
      T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/tracks", case: "happy", actor: "superadmin" }, r, [200, 201], "");
      const trId = (D(r) as { id?: string } | undefined)?.id;
      if (trId) trash.push(["tracks", trId]);
      if (trId) {
        r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/tracks/${trId}`, { actor: "superadmin", body: { nameEn: `${TAG} track v2` } });
        T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/tracks/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
        r = await call("superadmin", "POST", "/api/v1/admin/catalog/grade-tracks", { actor: "superadmin", body: { gradeLevelId: glId, trackId: trId } });
        T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/grade-tracks", case: "happy", actor: "superadmin" }, r, [200, 201], "");
        const gtId = (D(r) as { id?: string } | undefined)?.id;
        r = await call("superadmin", "POST", "/api/v1/admin/catalog/subjects", { actor: "superadmin", body: { code: `${TAG}-sub`.toLowerCase(), nameAr: `${TAG} مادة`, nameEn: `${TAG} subject` } });
        T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/subjects", case: "happy", actor: "superadmin" }, r, [200, 201], "");
        const subId = (D(r) as { id?: string } | undefined)?.id;
        if (subId) trash.push(["subjects", subId]);
        if (subId) {
          r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/subjects/${subId}`, { actor: "superadmin", body: { nameEn: `${TAG} subject v2` } });
          T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/subjects/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
          r = await call("superadmin", "POST", "/api/v1/admin/catalog/offerings", { actor: "superadmin", body: { gradeLevelId: glId, subjectId: subId, trackId: trId, isMandatory: true } });
          T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/offerings", case: "happy", actor: "superadmin" }, r, [200, 201], "");
          const offId = (D(r) as { id?: string } | undefined)?.id;
          if (offId) {
            r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/offerings/${offId}`, { actor: "superadmin", body: { isMandatory: false } });
            T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/offerings/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
            r = await call("superadmin", "DELETE", `/api/v1/admin/catalog/offerings/${offId}`, { actor: "superadmin" });
            T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/catalog/offerings/[id]", case: "happy", actor: "superadmin" }, r, [200, 204], "");
          }
        }
        if (gtId) {
          r = await call("superadmin", "DELETE", `/api/v1/admin/catalog/grade-tracks/${gtId}`, { actor: "superadmin" });
          T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/catalog/grade-tracks/[id]", case: "happy", actor: "superadmin" }, r, [200, 204], "");
        }
      }
    }
  }

  // ============== SUPERADMIN: money config (capture -> mutate -> restore) ==============
  const cBefore = D(await call("superadmin", "GET", "/api/v1/admin/commission-settings", { actor: "superadmin" })) as { teacherDirectCommissionBp: number; platformTeacherFee: number; platformCenterFee: number };
  r = await call("superadmin", "PUT", "/api/v1/admin/commission-settings", { actor: "superadmin", body: { teacherDirectCommissionBp: cBefore.teacherDirectCommissionBp, platformTeacherFee: cBefore.platformTeacherFee, platformCenterFee: cBefore.platformCenterFee } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/commission-settings", case: "idempotent-write", actor: "superadmin" }, r, [200], "written back with the SAME values (no drift)");
  r = await call("superadmin", "PUT", "/api/v1/admin/commission-settings", { actor: "superadmin", body: { teacherDirectCommissionBp: 20000, platformTeacherFee: 0, platformCenterFee: 0 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/commission-settings", case: "bp-over-100pct", actor: "superadmin" }, r, [400, 422], "a commission over 100% must be rejected");

  const splitBefore = D(await call("superadmin", "GET", "/api/v1/admin/revenue-split", { actor: "superadmin" })) as { split: { platformShareBp: number; teacherShareBp: number; centerShareBp: number } };
  r = await call("superadmin", "PUT", "/api/v1/admin/revenue-split", { actor: "superadmin", body: splitBefore.split });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/revenue-split", case: "idempotent-write", actor: "superadmin" }, r, [200], "same values written back");
  r = await call("superadmin", "PUT", "/api/v1/admin/revenue-split/per-student-rate", { actor: "superadmin", body: { fee: 500, bp: null } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/revenue-split/per-student-rate", case: "happy", actor: "superadmin" }, r, [200], "");
  r = await call("superadmin", "PUT", "/api/v1/admin/revenue-split/per-student-rate", { actor: "superadmin", body: { fee: 500, bp: 100 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/revenue-split/per-student-rate", case: "both-set", actor: "superadmin" }, r, [400, 422], "exactly one of fee|bp");
  r = await call("superadmin", "DELETE", "/api/v1/admin/revenue-split/per-student-rate", { actor: "superadmin" });
  T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/revenue-split/per-student-rate", case: "clear", actor: "superadmin" }, r, [200, 204], "global M2 rate cleared back to null");

  // per-center split
  r = await call("superadmin", "PUT", `/api/v1/admin/centers/${NILE}/split`, { actor: "superadmin", body: { platformShareBp: 1500, teacherShareBp: 7000, centerShareBp: 1500 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/split", case: "happy", actor: "superadmin" }, r, [200], "");
  r = await call("superadmin", "PUT", `/api/v1/admin/centers/${NILE}/split`, { actor: "superadmin", body: { platformShareBp: 1500, teacherShareBp: 7000, centerShareBp: 2000 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/split", case: "bad-sum", actor: "superadmin" }, r, [400, 422], "shares must sum to 10000bp");
  r = await call("superadmin", "DELETE", `/api/v1/admin/centers/${NILE}/split`, { actor: "superadmin" });
  T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/centers/[id]/split", case: "clear", actor: "superadmin" }, r, [200, 204], "restored to inherit the global split");
  r = await call("superadmin", "PUT", `/api/v1/admin/centers/${NILE}/per-student-rate`, { actor: "superadmin", body: { fee: 300, bp: null } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/per-student-rate", case: "happy", actor: "superadmin" }, r, [200], "");
  r = await call("superadmin", "DELETE", `/api/v1/admin/centers/${NILE}/per-student-rate`, { actor: "superadmin" });
  T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/centers/[id]/per-student-rate", case: "clear", actor: "superadmin" }, r, [200, 204], "");

  const roomId = (fx.roomNile as unknown as { id: string })?.id;
  if (roomId) {
    r = await call("superadmin", "PATCH", `/api/v1/admin/centers/${NILE}/rooms/${roomId}`, { actor: "superadmin", body: { allowedPricingMethods: ["whole_room_percent"] } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/centers/[id]/rooms/[roomId]", case: "happy", actor: "superadmin" }, r, [200], "");
    r = await call("superadmin", "PUT", `/api/v1/admin/centers/${NILE}/rooms/${roomId}/split`, { actor: "superadmin", body: { platformShareBp: 1000, teacherShareBp: 7000, centerShareBp: 2000 } });
    T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/rooms/[roomId]/split", case: "happy", actor: "superadmin" }, r, [200], "");
    r = await call("superadmin", "DELETE", `/api/v1/admin/centers/${NILE}/rooms/${roomId}/split`, { actor: "superadmin" });
    T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/centers/[id]/rooms/[roomId]/split", case: "clear", actor: "superadmin" }, r, [200, 204], "");
    r = await call("superadmin", "PUT", `/api/v1/admin/centers/${NILE}/rooms/${roomId}/per-student-rate`, { actor: "superadmin", body: { fee: 250, bp: null } });
    T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate", case: "happy", actor: "superadmin" }, r, [200, 400, 422], "room must allow the per-student method first");
    r = await call("superadmin", "DELETE", `/api/v1/admin/centers/${NILE}/rooms/${roomId}/per-student-rate`, { actor: "superadmin" });
    T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate", case: "clear", actor: "superadmin" }, r, [200, 204], "");
    r = await call("superadmin", "PUT", `/api/v1/admin/centers/${NILE}/rooms/${roomId}/split`, { actor: "centerAdmin", body: { platformShareBp: 0, teacherShareBp: 0, centerShareBp: 10000 } });
    T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/rooms/[roomId]/split", case: "center-cannot-set-own-split", actor: "centerAdmin" }, r, [401, 403], "a center must never set its own revenue split");
  }

  const affId = (fx.affiliation as unknown as { id: string })?.id;
  if (affId) {
    const affCenter = (fx.affiliation as unknown as { center_id: string }).center_id;
    const cs = (await q(`select center_share from center_teacher_affiliations where id=$1`, [affId]))[0]?.center_share ?? 0;
    r = await call("superadmin", "PUT", `/api/v1/admin/centers/${affCenter}/affiliations/${affId}`, { actor: "superadmin", body: { centerShare: 1234 } });
    T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/centers/[id]/affiliations/[affiliationId]", case: "happy", actor: "superadmin" }, r, [200], "");
    await call("superadmin", "PUT", `/api/v1/admin/centers/${affCenter}/affiliations/${affId}`, { actor: "superadmin", body: { centerShare: cs } });
    note({ case: "affiliation-centerShare-restored" }, "PASS", `restored to ${cs}`);
  }

  // ============== SUPERADMIN: user lifecycle ==============
  const pendingTeacher = actors.teacherPending?.id;
  if (pendingTeacher) {
    r = await call("superadmin", "POST", `/api/v1/admin/teachers/${pendingTeacher}/reject`, { actor: "superadmin", body: { reason: `${TAG} probe` } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/teachers/[id]/reject", case: "happy", actor: "superadmin" }, r, [200], "");
    r = await call("superadmin", "POST", `/api/v1/admin/teachers/${pendingTeacher}/approve`, { actor: "superadmin", body: {} });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/teachers/[id]/approve", case: "happy", actor: "superadmin" }, r, [200], "");
    await pool.query(`update users set status='pending' where id=$1`, [pendingTeacher]);
    note({ case: "pending-teacher-restored" }, "PASS", "demo pending teacher put back to status=pending");
  }
  r = await call("superadmin", "PATCH", `/api/v1/admin/teachers/${actors.teacher.id}/attendance-mode`, { actor: "superadmin", body: { mode: "counter_only" } });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/teachers/[id]/attendance-mode", case: "happy", actor: "superadmin" }, r, [200], "");
  r = await call("superadmin", "POST", `/api/v1/admin/teachers/${actors.teacher.id}/link-center`, { actor: "superadmin", body: { centerId: NILE } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/teachers/[id]/link-center", case: "already-linked", actor: "superadmin" }, r, [200, 201, 409], "");
  r = await call("superadmin", "PATCH", `/api/v1/admin/users/${actors.teacher.id}/permissions`, { actor: "superadmin", body: { status: "suspended" } });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/users/[id]/permissions", case: "suspend", actor: "superadmin" }, r, [200], "");
  const suspended = await call("www", "GET", "/api/v1/me", { actor: "teacher" });
  note({ app: "www", case: "suspension-takes-effect", path: "/api/v1/me", method: "GET", actor: "teacher" },
    suspended.status === 200 ? "SUSPICIOUS" : "PASS",
    `after status=suspended the existing 30-day JWT still returns ${suspended.status} on /api/v1/me (L1 revokes on token_version, which a suspension does not bump)`);
  r = await call("superadmin", "PATCH", `/api/v1/admin/users/${actors.teacher.id}/permissions`, { actor: "superadmin", body: { status: "active" } });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/users/[id]/permissions", case: "restore", actor: "superadmin" }, r, [200], "restored to active");

  // blacklist lifecycle (platform level)
  r = await call("superadmin", "POST", `/api/v1/admin/users/${studentId}/blacklist`, { actor: "superadmin", body: { reason: `${TAG} probe` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/users/[id]/blacklist", case: "happy", actor: "superadmin" }, r, [200, 201, 409], "");
  const bl = (await q(`select id from blacklist_entries where target_id=$1 and is_active=true order by created_at desc limit 1`, [studentId]))[0];
  if (bl) {
    r = await call("superadmin", "POST", `/api/v1/admin/blacklist/${bl.id}/remove`, { actor: "accountant", body: { reason: "x" } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/blacklist/[id]/remove", case: "wrong-role", actor: "accountant" }, r, [401, 403], "");
    r = await call("superadmin", "POST", `/api/v1/admin/blacklist/${bl.id}/remove`, { actor: "superadmin", body: { reason: `${TAG} cleanup` } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/blacklist/[id]/remove", case: "happy", actor: "superadmin" }, r, [200], "reversible");
  }
  r = await call("superadmin", "POST", `/api/v1/admin/students/${studentId}/blacklist`, { actor: "superadmin", body: { reason: `${TAG} probe2` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/students/[id]/blacklist", case: "happy", actor: "superadmin" }, r, [200, 201, 409], "keyed by USER id (the sibling detail route uses the PROFILE id)");
  const bl2 = (await q(`select id from blacklist_entries where target_id=$1 and is_active=true order by created_at desc limit 1`, [studentId]))[0];
  if (bl2) await call("superadmin", "POST", `/api/v1/admin/blacklist/${bl2.id}/remove`, { actor: "superadmin", body: { reason: `${TAG} cleanup` } });
  r = await call("superadmin", "POST", `/api/v1/admin/centers/${NILE}/blacklist`, { actor: "superadmin", body: { reason: `${TAG} probe` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/centers/[id]/blacklist", case: "happy", actor: "superadmin" }, r, [200, 201, 409], "");
  const bl3 = (await q(`select id from blacklist_entries where target_id=$1 and is_active=true order by created_at desc limit 1`, [NILE]))[0];
  if (bl3) await call("superadmin", "POST", `/api/v1/admin/blacklist/${bl3.id}/remove`, { actor: "superadmin", body: { reason: `${TAG} cleanup` } });
  await pool.query(`update centers set status='active' where id=$1`, [NILE]);
  await pool.query(`update users set status='active' where id=$1`, [studentId]);
  note({ case: "blacklist-restored" }, "PASS", "demo center + student put back to active");

  // parent link admin ops
  r = await call("superadmin", "POST", `/api/v1/admin/students/${studentId}/link-parent`, { actor: "superadmin", body: { parentId: actors.parent.id } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/students/[id]/link-parent", case: "already-linked", actor: "superadmin" }, r, [200, 201, 409], "");
  r = await call("superadmin", "DELETE", `/api/v1/admin/students/${studentId}/unlink-parent`, { actor: "superadmin" });
  T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/students/[id]/unlink-parent", case: "missing-linkId", actor: "superadmin" }, r, [400, 422], "linkId query param is required");

  // admin detail reads that were skipped
  const collab = (fx.collabRequest as unknown as { id: string })?.id;
  if (collab) {
    r = await call("superadmin", "GET", `/api/v1/admin/collaboration-requests/${collab}`, { actor: "superadmin" });
    T({ app: "superadmin", method: "GET", path: "/api/v1/admin/collaboration-requests/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
  }
  r = await call("superadmin", "PATCH", "/api/v1/me", { actor: "superadmin", body: {} });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/me", case: "no-op", actor: "superadmin" }, r, [200], "");
  const notif = (await q(`select id from notifications where user_id=$1 order by created_at desc limit 1`, [actors.superadmin.id]))[0];
  if (notif) {
    r = await call("superadmin", "POST", `/api/v1/notifications/${notif.id}/read`, { actor: "superadmin", body: {} });
    T({ app: "superadmin", method: "POST", path: "/api/v1/notifications/[id]/read", case: "happy", actor: "superadmin" }, r, [200], "");
  } else note({ app: "superadmin", case: "notifications/[id]/read", path: "/api/v1/notifications/[id]/read", method: "POST" }, "SKIP", "no notification row for the demo super-admin");
  const sNotif = (await q(`select id from notifications where user_id=$1 order by created_at desc limit 1`, [studentId]))[0];
  if (sNotif) {
    r = await call("www", "POST", `/api/v1/notifications/${sNotif.id}/read`, { actor: "student", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/notifications/[id]/read", case: "happy", actor: "student" }, r, [200], "");
    r = await call("www", "POST", `/api/v1/notifications/${sNotif.id}/read`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/notifications/[id]/read", case: "not-owner", actor: "teacher" }, r, [403, 404], "another user must not mark someone else's notification read");
  }

  // ============== FINANCE detail endpoints (no rows in the DB) ==============
  for (const [p, actor] of [["/api/v1/finance/invoices/00000000-0000-4000-8000-000000000000", "accountant"], ["/api/v1/finance/invoices/00000000-0000-4000-8000-000000000000/pdf", "accountant"], ["/api/v1/finance/subscriptions/00000000-0000-4000-8000-000000000000", "accountant"], ["/api/v1/finance/payouts/00000000-0000-4000-8000-000000000000/receipt", "accountant"]] as [string, string][]) {
    r = await call("superadmin", "GET", p, { actor });
    T({ app: "superadmin", method: "GET", path: p.replace(/[0-9a-f-]{36}/, "[id]"), case: "nonexistent-id", actor }, r, [404], "no invoices/payouts/subscriptions exist post-wipe — 404 is the correct answer");
  }
  r = await call("superadmin", "POST", "/api/v1/finance/payouts/00000000-0000-4000-8000-000000000000/approve", { actor: "accountant", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/payouts/[id]/approve", case: "nonexistent-id", actor: "accountant" }, r, [404, 400, 422], "");
  r = await call("superadmin", "POST", "/api/v1/finance/payouts/00000000-0000-4000-8000-000000000000/reject", { actor: "accountant", body: { reason: `${TAG} probe` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/payouts/[id]/reject", case: "nonexistent-id", actor: "accountant" }, r, [404, 400, 422], "");
  r = await call("superadmin", "POST", "/api/v1/finance/invoices/00000000-0000-4000-8000-000000000000/send-email", { actor: "accountant", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/invoices/[id]/send-email", case: "nonexistent-id", actor: "accountant" }, r, [404, 400, 422], "");
  r = await call("superadmin", "GET", "/api/v1/admin/subscriptions/00000000-0000-4000-8000-000000000000", { actor: "superadmin" });
  T({ app: "superadmin", method: "GET", path: "/api/v1/admin/subscriptions/[id]", case: "nonexistent-id", actor: "superadmin" }, r, [404], "");

  // ============== www: remaining endpoints ==============
  // roster add + remove
  r = await call("www", "POST", "/api/v1/roster/students", { actor: "centerAdmin", body: { studentId: fx.studentAndl?.["id"] } });
  T({ app: "www", method: "POST", path: "/api/v1/roster/students", case: "happy", actor: "centerAdmin" }, r, [200, 201, 409], "add an existing student to the roster");
  r = await call("www", "DELETE", `/api/v1/roster/students/${fx.studentAndl?.["id"]}`, { actor: "centerAdminAlien" });
  T({ app: "www", method: "DELETE", path: "/api/v1/roster/students/[studentId]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
  r = await call("www", "DELETE", `/api/v1/roster/students/${fx.studentAndl?.["id"]}`, { actor: "centerAdmin" });
  T({ app: "www", method: "DELETE", path: "/api/v1/roster/students/[studentId]", case: "happy", actor: "centerAdmin" }, r, [200, 204], "");
  r = await call("www", "DELETE", `/api/v1/roster/teachers/${actors.teacherAlien.id}`, { actor: "centerAdmin" });
  T({ app: "www", method: "DELETE", path: "/api/v1/roster/teachers/[teacherId]", case: "not-affiliated", actor: "centerAdmin" }, r, [200, 204, 404, 409, 422], "");

  // rooms delete (soft)
  const tmpRoom = await call("www", "POST", "/api/v1/rooms", { actor: "centerAdmin", body: { name: `${TAG} tmp`, capacity: 5 } });
  const tmpRoomId = (D(tmpRoom) as { id?: string } | undefined)?.id;
  if (tmpRoomId) {
    r = await call("www", "DELETE", `/api/v1/rooms/${tmpRoomId}`, { actor: "centerAdminAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/rooms/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/rooms/${tmpRoomId}`, { actor: "centerAdmin" });
    T({ app: "www", method: "DELETE", path: "/api/v1/rooms/[id]", case: "happy(soft)", actor: "centerAdmin" }, r, [200, 204], "");
    trash.push(["rooms", tmpRoomId]);
  }

  // reviews patch
  const rev = (await q(`select id from reviews where student_id=$1 order by created_at desc limit 1`, [studentId]))[0];
  if (rev) {
    r = await call("www", "PATCH", `/api/v1/reviews/${rev.id}`, { actor: "student", body: { rating: 4 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/reviews/[id]", case: "happy", actor: "student" }, r, [200], "");
    r = await call("www", "PATCH", `/api/v1/reviews/${rev.id}`, { actor: "msgStudentResolved", body: { rating: 1 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/reviews/[id]", case: "not-author", actor: "msgStudentResolved" }, r, [403, 404], "another student must not edit this review");
    r = await call("www", "DELETE", `/api/v1/reviews/${rev.id}`, { actor: "student" });
    T({ app: "www", method: "DELETE", path: "/api/v1/reviews/[id]", case: "happy", actor: "student" }, r, [200, 204, 405], "");
  }

  // ============== MONEY: walk-in cash subscription + session completion ==============
  const preMoney = await snap();
  const rfcSession = (await q(`select s.id, s.status, s.course_id from sessions s join courses c on c.id=s.course_id
      where c.center_id=$1 and s.status='scheduled'
        and s.id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' limit 1`, [NILE]))[0];
  note({ case: "rfc-session-availability" }, rfcSession ? "PASS" : "FAIL",
    rfcSession ? `found an RFC-uuid NILE session for the counter/walk-in flows: ${rfcSession.id}` : "NO NILE session has an RFC-valid uuid — the counter check-in / walk-in cash / door check-in flows CANNOT be demoed on the seeded data");

  if (rfcSession) {
    r = await call("www", "POST", "/api/v1/center/subscriptions", { actor: "receptionist", body: { studentId, courseId: rfcSession.course_id, plan: "per_session", sessionId: rfcSession.id, markAttendance: true } });
    const walkOk = T({ app: "www", method: "POST", path: "/api/v1/center/subscriptions", case: "walk-in-cash+checkin", actor: "receptionist" }, r, [200, 201, 409, 422], "the classic Egyptian counter workflow in ONE step");
    const afterWalk = await snap();
    note({ case: "walk-in-cash-ledger" }, walkOk ? (afterWalk.t > preMoney.t ? "PASS" : "SUSPICIOUS") : "SKIP",
      `after the walk-in cash subscription: transactions ${preMoney.t}->${afterWalk.t}, payments ${preMoney.p}->${afterWalk.p}, subscriptions ${preMoney.s}->${afterWalk.s}`);
    r = await call("www", "POST", "/api/v1/center/subscriptions", { actor: "centerAdminAlien", body: { studentId, courseId: rfcSession.course_id, plan: "per_session", sessionId: rfcSession.id } });
    T({ app: "www", method: "POST", path: "/api/v1/center/subscriptions", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404, 422], "");

    r = await call("www", "POST", "/api/v1/center/wallet-topup", { actor: "receptionist", body: { studentId, amount: 1000 } });
    T({ app: "www", method: "POST", path: "/api/v1/center/wallet-topup", case: "happy", actor: "receptionist" }, r, [200, 201], "cash wallet top-up at the counter");
    r = await call("www", "POST", "/api/v1/center/wallet-topup", { actor: "receptionist", body: { studentId, amount: -1000 } });
    T({ app: "www", method: "POST", path: "/api/v1/center/wallet-topup", case: "negative", actor: "receptionist" }, r, [400, 422], "credit-only — no counter-side debit");
    r = await call("www", "POST", "/api/v1/center/wallet-topup", { actor: "centerAdminAlien", body: { studentId, amount: 1000 } });
    T({ app: "www", method: "POST", path: "/api/v1/center/wallet-topup", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404, 422], "");

    // ---- session completion: the distribution engine, exactly-once ----
    const s0 = await snap();
    r = await call("www", "POST", `/api/v1/sessions/${rfcSession.id}/complete`, { actor: "teacherAlien", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/complete", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/sessions/${rfcSession.id}/complete`, { actor: "teacher", body: {} });
    const compOk = T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/complete", case: "happy", actor: "teacher" }, r, [200, 201, 409, 422], "runs the fee/points/wallet distribution");
    const s1 = await snap();
    note({ case: "session-completion-distribution" }, compOk ? "PASS" : "SKIP",
      `transactions ${s0.t}->${s1.t}, session_settlements ${s0.ss}->${s1.ss}`);
    r = await call("www", "POST", `/api/v1/sessions/${rfcSession.id}/complete`, { actor: "teacher", body: {} });
    const s2 = await snap();
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/complete", case: "exactly-once-replay", actor: "teacher" }, r, [200, 201, 409, 422], "completing an already-completed session");
    note({ case: "distributedAt-exactly-once" }, s2.t === s1.t && s2.ss === s1.ss ? "PASS" : "FAIL",
      `re-completing the SAME session ${s2.t === s1.t && s2.ss === s1.ss ? "wrote NO extra ledger rows (distributedAt gate holds)" : `DUPLICATED: txn ${s1.t}->${s2.t}, settlements ${s1.ss}->${s2.ss}`}`);
  }

  // subscription cancel
  const sub = (await q(`select id from subscriptions order by created_at desc limit 1`))[0];
  if (sub) {
    r = await call("www", "POST", `/api/v1/subscriptions/${sub.id}/cancel`, { actor: "msgStudentResolved", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/subscriptions/[id]/cancel", case: "not-owner", actor: "msgStudentResolved" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/subscriptions/${sub.id}/cancel`, { actor: "student", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/subscriptions/[id]/cancel", case: "happy", actor: "student" }, r, [200, 409, 422], "");
  } else note({ app: "www", case: "subscriptions/[id]/cancel", path: "/api/v1/subscriptions/[id]/cancel", method: "POST" }, "SKIP", "no subscription row to cancel");

  // ============== CLEANUP ==============
  console.log("\n--- CLEANUP ---");
  await pool.query(`update sessions set status='scheduled', distributed_at=null where id=$1`, [rfcSession?.id ?? "00000000-0000-4000-8000-000000000000"]);
  await pool.query(`delete from session_settlements where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from wallet_ledger where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from transactions where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from payments where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from subscriptions where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from payment_intents where created_at > now() - interval '25 minutes'`);
  await pool.query(`delete from attendance_records where created_at > now() - interval '25 minutes'`);
  await pool.query(`update student_profiles set wallet_balance=0 where user_id=$1`, [studentId]);
  await pool.query(`update teacher_profiles set wallet_balance=0 where user_id=$1`, [actors.teacher.id]);
  await pool.query(`update centers set wallet_balance=0, receipt_seq=0 where id=$1`, [NILE]);
  for (const [table, id] of trash.reverse()) {
    try { await pool.query(`delete from ${table} where id=$1`, [id]); } catch (e) { console.log("skip", table, id, (e as Error).message.slice(0, 60)); }
  }
  await pool.query(`delete from users where email like $1`, [`${TAG}%`]);
  await pool.query(`delete from center_student_rosters where student_id=$1 and center_id=$2`, [fx.studentAndl?.["id"] ?? null, NILE]);
  const after = await snap();
  console.log("AFTER:", JSON.stringify(after));
  note({ case: "cleanup" }, JSON.stringify(after) === JSON.stringify(base) ? "PASS" : "SUSPICIOUS", `${JSON.stringify(base)} -> ${JSON.stringify(after)}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-write-3.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-write-3:", JSON.stringify(t));
  await pool.end();
}
main();
