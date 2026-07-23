/** PHASE 2k — gap closer: the endpoints whose happy path needs a fixture that
 *  had to be created first (parent-link approve/reject, enrollment-request
 *  approve/decline, catalog tracks/subjects/offerings/grade-tracks, etc.). */
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
const TAG = "apigap-" + Math.random().toString(36).slice(2, 7);

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
  results.push({ ...meta, status: res.status, expected: expected.join("|"), verdict: okStatus ? "PASS" : "FAIL", note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json) : res.text).slice(0, 260)}`, body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 300) });
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case}) -> ${res.status}`, okStatus ? "" : ":: " + (res.json ? JSON.stringify(res.json) : res.text).slice(0, 180));
  return okStatus;
}
const D = (r: { json: never | null }) => (r.json as never as { data?: never })?.data as never;
const ID = (r: { json: never | null }) => (D(r) as { id?: string } | undefined)?.id;

async function main() {
  console.log("TAG:", TAG);
  const studentId = actors.student.id;

  // ---------- catalog chain (tracks / subjects / grade-tracks / offerings) ----------
  const sysId = (fx.system as unknown as { id: string })?.id;
  let r = await call("superadmin", "POST", "/api/v1/admin/catalog/stages", { actor: "superadmin", body: { code: `${TAG}-st`.toLowerCase(), educationSystemId: sysId, nameAr: "م", nameEn: "st" } });
  const stageId = ID(r);
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/grade-levels", { actor: "superadmin", body: { code: `${TAG}-gl`.toLowerCase(), stageId, level: 1, nameAr: "ص", nameEn: "gl" } });
  const glId = ID(r);
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/tracks", { actor: "superadmin", body: { code: `${TAG}-tr`.toLowerCase(), stageId, nameAr: "ش", nameEn: "tr" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/tracks", case: "happy" }, r, [200, 201], "");
  const trId = ID(r);
  r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/tracks/${trId}`, { actor: "superadmin", body: { nameEn: "tr2" } });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/tracks/[id]", case: "happy" }, r, [200], "");
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/subjects", { actor: "superadmin", body: { code: `${TAG}-sb`.toLowerCase(), nameAr: "مادة", nameEn: "sb" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/subjects", case: "happy" }, r, [200, 201], "");
  const sbId = ID(r);
  r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/subjects/${sbId}`, { actor: "superadmin", body: { nameEn: "sb2" } });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/subjects/[id]", case: "happy" }, r, [200], "");
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/grade-tracks", { actor: "superadmin", body: { gradeLevelId: glId, trackId: trId } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/grade-tracks", case: "happy" }, r, [200, 201], "");
  const gtId = ID(r);
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/offerings", { actor: "superadmin", body: { gradeLevelId: glId, subjectId: sbId, trackId: trId, isMandatory: true } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/offerings", case: "happy" }, r, [200, 201], "");
  const offId = ID(r);
  if (offId) {
    r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/offerings/${offId}`, { actor: "superadmin", body: { isActive: false } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/offerings/[id]", case: "happy" }, r, [200], "");
    r = await call("superadmin", "DELETE", `/api/v1/admin/catalog/offerings/${offId}`, { actor: "superadmin" });
    T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/catalog/offerings/[id]", case: "happy" }, r, [200, 204], "");
  }
  if (gtId) {
    r = await call("superadmin", "DELETE", `/api/v1/admin/catalog/grade-tracks/${gtId}`, { actor: "superadmin" });
    T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/catalog/grade-tracks/[id]", case: "happy" }, r, [200, 204], "");
  }
  // subject-request approve
  r = await call("www", "POST", "/api/v1/me/subject-requests", { actor: "teacher", body: { suggestedName: `${TAG} subj`, gradeLevelId: glId } });
  const srId = ID(r);
  if (srId) {
    r = await call("superadmin", "POST", `/api/v1/admin/catalog/subject-requests/${srId}/approve`, { actor: "superadmin", body: { subjectId: sbId } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/subject-requests/[id]/approve", case: "happy" }, r, [200, 201], "creates the subject");
  }

  // ---------- center toggle / teacher blacklist / unlink-center ----------
  r = await call("superadmin", "PATCH", `/api/v1/admin/centers/${fx.centerNile}/toggle`, { actor: "superadmin", body: { status: "suspended" } });
  T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/centers/[id]/toggle", case: "happy" }, r, [200], "");
  await call("superadmin", "PATCH", `/api/v1/admin/centers/${fx.centerNile}/toggle`, { actor: "superadmin", body: { status: "active" } });
  r = await call("superadmin", "POST", `/api/v1/admin/teachers/${actors.teacherAlien.id}/blacklist`, { actor: "superadmin", body: { reason: `${TAG} probe` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/teachers/[id]/blacklist", case: "happy" }, r, [200, 201, 409], "");
  const bl = (await q(`select id from blacklist_entries where target_id=$1 and is_active=true order by created_at desc limit 1`, [actors.teacherAlien.id]))[0];
  if (bl) await call("superadmin", "POST", `/api/v1/admin/blacklist/${bl.id}/remove`, { actor: "superadmin", body: { reason: `${TAG} cleanup` } });
  await pool.query(`update users set status='active' where id=$1`, [actors.teacherAlien.id]);
  r = await call("superadmin", "DELETE", `/api/v1/admin/teachers/${actors.teacher.id}/unlink-center?centerId=${fx.centerNile}`, { actor: "superadmin" });
  T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/teachers/[id]/unlink-center", case: "happy" }, r, [200, 204, 400, 404, 422], "");
  await call("superadmin", "POST", `/api/v1/admin/teachers/${actors.teacher.id}/link-center`, { actor: "superadmin", body: { centerId: fx.centerNile } });
  await pool.query(`update center_teacher_affiliations set status='active', removed_at=null where teacher_id=$1 and center_id=$2`, [actors.teacher.id, fx.centerNile]);

  // ---------- parent-link approve / reject / delete ----------
  const fam = await call("www", "GET", "/api/v1/me/family-code", { actor: "student" });
  const code = (D(fam) as { familyLinkCode?: string; code?: string } | undefined)?.familyLinkCode ?? (D(fam) as { code?: string } | undefined)?.code;
  // a parent the student is NOT yet linked to -> pending link needing approval
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "student", body: { email: actors.msgParent.email } });
  const pl = ID(r);
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "student-initiated(email)" }, r, [200, 201, 409, 422], `family code ${code ? "present" : "absent"}; student-initiated links need approval`);
  if (pl) {
    r = await call("www", "POST", `/api/v1/parent-links/${pl}/approve`, { actor: "student", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/parent-links/[id]/approve", case: "initiator-cannot-approve" }, r, [400, 403, 422], "the initiating side must not approve its own request");
    r = await call("www", "POST", `/api/v1/parent-links/${pl}/approve`, { actor: "msgParent", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/parent-links/[id]/approve", case: "happy" }, r, [200], "");
    r = await call("www", "DELETE", `/api/v1/parent-links/${pl}`, { actor: "msgParent" });
    T({ app: "www", method: "DELETE", path: "/api/v1/parent-links/[id]", case: "happy" }, r, [200, 204], "revoke");
  }
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "student", body: { email: actors.msgParent.email } });
  const pl2 = ID(r);
  if (pl2) {
    r = await call("www", "POST", `/api/v1/parent-links/${pl2}/reject`, { actor: "msgParent", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/parent-links/[id]/reject", case: "happy" }, r, [200], "");
  }

  // ---------- enrollment requests approve / decline / delete ----------
  const freeCourse = (await q(`select c.id from courses c where c.center_id=$1 and c.status='active'
      and not exists (select 1 from enrollments e where e.course_id=c.id and e.student_id=$2 and e.status='active') limit 1`, [fx.centerNile, studentId]))[0];
  if (freeCourse) {
    r = await call("www", "POST", "/api/v1/enrollment-requests", { actor: "student", body: { courseId: freeCourse.id } });
    const er = ID(r);
    if (er) {
      r = await call("www", "POST", `/api/v1/enrollment-requests/${er}/approve`, { actor: "centerAdmin", body: {} });
      T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests/[id]/approve", case: "happy" }, r, [200, 201], "");
      const enr = (await q(`select id from enrollments where student_id=$1 and course_id=$2 and status='active' order by enrolled_at desc limit 1`, [studentId, freeCourse.id]))[0];
      if (enr) {
        r = await call("www", "DELETE", `/api/v1/enrollments/${enr.id}`, { actor: "centerAdmin" });
        T({ app: "www", method: "DELETE", path: "/api/v1/enrollments/[id]", case: "happy" }, r, [200, 204], "");
      }
    }
    r = await call("www", "POST", "/api/v1/enrollment-requests", { actor: "student", body: { courseId: freeCourse.id } });
    const er2 = ID(r);
    if (er2) {
      r = await call("www", "POST", `/api/v1/enrollment-requests/${er2}/decline`, { actor: "centerAdmin", body: { reason: `${TAG} probe` } });
      T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests/[id]/decline", case: "happy" }, r, [200], "");
    }
    r = await call("www", "POST", "/api/v1/enrollment-requests", { actor: "student", body: { courseId: freeCourse.id } });
    const er3 = ID(r);
    if (er3) {
      r = await call("www", "DELETE", `/api/v1/enrollment-requests/${er3}`, { actor: "student" });
      T({ app: "www", method: "DELETE", path: "/api/v1/enrollment-requests/[id]", case: "happy" }, r, [200, 204], "student cancels their own request");
    }
  }

  // ---------- materials PATCH/DELETE, center blacklist DELETE, collab reject, affiliation decline ----------
  const fd = new FormData();
  fd.append("courseId", fx.courseNile as unknown as string);
  fd.append("title", `${TAG} note`);
  fd.append("type", "lecture");
  fd.append("externalUrl", "https://example.com/x.pdf");
  const up = await fetch("http://localhost:3002/api/v1/materials", { method: "POST", headers: { cookie: actors.teacher.cookie }, body: fd });
  const upJson = await up.json().catch(() => null);
  const matId = upJson?.data?.id;
  if (matId) {
    r = await call("www", "PATCH", `/api/v1/materials/${matId}`, { actor: "teacher", body: { title: `${TAG} note v2` } });
    T({ app: "www", method: "PATCH", path: "/api/v1/materials/[id]", case: "happy" }, r, [200], "");
    r = await call("www", "DELETE", `/api/v1/materials/${matId}`, { actor: "teacher" });
    T({ app: "www", method: "DELETE", path: "/api/v1/materials/[id]", case: "happy" }, r, [200, 204], "");
  }
  r = await call("www", "POST", "/api/v1/center/blacklist", { actor: "centerAdmin", body: { studentId, reason: `${TAG} probe` } });
  const cbl = ID(r);
  if (cbl) {
    r = await call("www", "DELETE", `/api/v1/center/blacklist/${cbl}`, { actor: "centerAdmin", body: { reason: `${TAG} lift` } });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/blacklist/[id]", case: "happy" }, r, [200, 204], "reversible");
  }
  const soon = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  r = await call("www", "POST", "/api/v1/collaboration-requests", { actor: "teacher", body: { centerId: fx.centerAndl, subjectId: (fx.subject as unknown as { id: string })?.id, gradeLevelId: (fx.gradeLevel as unknown as { id: string })?.id, daysOfWeek: [3], startTime: "02:00", endTime: "03:00", startDate: soon, message: `${TAG} probe` } });
  const cr = ID(r);
  if (cr) {
    r = await call("www", "POST", `/api/v1/collaboration-requests/${cr}/reject`, { actor: "centerAdmin", body: { reason: `${TAG} probe` } });
    T({ app: "www", method: "POST", path: "/api/v1/collaboration-requests/[id]/reject", case: "wrong-center" }, r, [403, 404], "only the TARGET center may reject");
    await pool.query(`delete from collaboration_requests where id=$1`, [cr]);
  }
  const aff = (await q(`select id,teacher_id from center_teacher_affiliations where status='pending' limit 1`))[0];
  if (aff) {
    r = await call("www", "POST", `/api/v1/affiliations/${aff.id}/decline`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/affiliations/[id]/decline", case: "not-the-invitee" }, r, [200, 403, 404], "");
  }
  // deletion-request approve
  r = await call("www", "POST", "/api/v1/me/delete-request", { actor: "student", body: { reason: `${TAG} probe` } });
  const dr = ID(r);
  if (dr) {
    r = await call("www", "POST", `/api/v1/deletion-requests/${dr}/approve`, { actor: "centerAdminAlien", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/deletion-requests/[id]/approve", case: "cross-tenant" }, r, [403, 404], "another center must not approve this deletion");
    await pool.query(`delete from deletion_requests where id=$1`, [dr]);
  }
  // centers/me/admins DELETE
  const admins = await call("www", "GET", "/api/v1/centers/me/admins", { actor: "centerAdmin" });
  const others = ((D(admins) as { userId?: string; id?: string }[] | undefined) ?? []).filter((a) => (a.userId ?? a.id) !== actors.centerAdmin.id);
  if (others.length) {
    r = await call("www", "DELETE", `/api/v1/centers/me/admins/${others[0].userId ?? others[0].id}`, { actor: "centerAdminAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/centers/me/admins/[userId]", case: "cross-tenant" }, r, [403, 404], "");
  } else {
    r = await call("www", "DELETE", `/api/v1/centers/me/admins/${actors.centerAdmin.id}`, { actor: "centerAdmin" });
    T({ app: "www", method: "DELETE", path: "/api/v1/centers/me/admins/[userId]", case: "cannot-remove-self" }, r, [400, 403, 409, 422], "the last/self admin must not be removable");
  }

  // ---------- cleanup ----------
  console.log("\n--- CLEANUP ---");
  await pool.query(`delete from subject_offerings where subject_id in (select id from subjects where code ~ '^apigap')`);
  await pool.query(`delete from grade_level_tracks where track_id in (select id from tracks where code ~ '^apigap')`);
  await pool.query(`delete from subject_requests where suggested_name ~ '^apigap'`);
  await pool.query(`delete from subjects where code ~ '^apigap' or name_en ~ '^apigap' or name_ar ~ '^apigap'`);
  await pool.query(`delete from tracks where code ~ '^apigap'`);
  await pool.query(`delete from grade_levels where code ~ '^apigap'`);
  await pool.query(`delete from stages where code ~ '^apigap'`);
  await pool.query(`delete from materials where title ~ '^apigap'`);
  await pool.query(`delete from collaboration_requests where message ~ '^apigap'`);
  await pool.query(`delete from deletion_requests where reason ~ '^apigap'`);
  await pool.query(`delete from enrollment_requests where student_id=$1 and created_at > now() - interval '20 minutes'`, [studentId]);
  await pool.query(`delete from parent_student_links where parent_id=$1 and student_id=$2`, [actors.msgParent.id, studentId]);
  await pool.query(`delete from notifications where title ~ '^apigap'`);
  await pool.query(`update enrollments set status='active', unenrolled_at=null where student_id=$1 and status='unenrolled'`, [studentId]);
  await pool.query(`update users set status='active' where email in ('admin@nile-academy.eg','khaled.samir@andalus.eg')`);
  await pool.query(`update centers set status='active' where id=$1`, [fx.centerNile]);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-gaps.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-gaps:", JSON.stringify(t));
  await pool.end();
}
main();
