/** Corrections + follow-ups for write suite 2 (fixes harness-side mistakes and
 *  clears the blacklist rows the first pass left behind). */
import { call, record, flush, fx, actors } from "./_apiharness.mjs";

const TAG = "apiv2b-" + Math.random().toString(36).slice(2, 7);
function T(meta, res, expected, note = "") {
  const exp = Array.isArray(expected) ? expected : [expected];
  const okStatus = exp.includes(res.status);
  record({
    ...meta, status: res.status, expected: exp.join("|"),
    verdict: okStatus ? "PASS" : "FAIL",
    note: okStatus ? note : `${note ? note + " | " : ""}expected ${exp.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json.error ?? res.json) : res.text).slice(0, 300)}`,
    body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 500),
  });
  return okStatus;
}
const D = (r) => r.json?.data;

async function main() {
  const studentUserId = fx.enrollmentNile?.student_id ?? actors.student.id;

  // ---- clear the blacklist entries left by pass 1 (DELETE needs a JSON body) ----
  let list = await call("www", "GET", "/api/v1/center/blacklist", { actor: "centerAdmin" });
  const centerEntries = (D(list) ?? []).filter((e) => e.isActive !== false);
  for (const e of centerEntries) {
    const r = await call("www", "DELETE", `/api/v1/center/blacklist/${e.id}`, { actor: "centerAdminAlien", body: { reason: "cross-tenant probe" } });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/blacklist/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "another center must not lift this center's blacklist");
    const r2 = await call("www", "DELETE", `/api/v1/center/blacklist/${e.id}`, { actor: "centerAdmin", body: { reason: `${TAG} api-verification cleanup` } });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/blacklist/[id]", case: "happy(reversible)", actor: "centerAdmin" }, r2, [200, 204], "blacklist is reversible; DELETE requires a reason body");
  }

  list = await call("www", "GET", "/api/v1/teacher/blacklist", { actor: "teacher" });
  const tEntries = (D(list) ?? []).filter((e) => e.isActive !== false);
  for (const e of tEntries) {
    const r = await call("www", "DELETE", `/api/v1/teacher/blacklist/${e.id}`, { actor: "teacherAlien", body: { reason: "cross-teacher probe" } });
    T({ app: "www", method: "DELETE", path: "/api/v1/teacher/blacklist/[id]", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    const r2 = await call("www", "DELETE", `/api/v1/teacher/blacklist/${e.id}`, { actor: "teacher", body: { reason: `${TAG} api-verification cleanup` } });
    T({ app: "www", method: "DELETE", path: "/api/v1/teacher/blacklist/[id]", case: "happy", actor: "teacher" }, r2, [200, 204], "");
  }

  // ---- re-run what the blacklist had blocked ----
  let r = await call("www", "POST", "/api/v1/enrollments", { actor: "centerAdmin", body: { studentId: studentUserId, courseId: fx.courseNile } });
  T({ app: "www", method: "POST", path: "/api/v1/enrollments", case: "duplicate-active", actor: "centerAdmin" }, r, [409, 422], "one ACTIVE enrollment per (student,course)");
  r = await call("www", "POST", "/api/v1/enrollment-requests", { actor: "student", body: { courseId: fx.courseNile2 } });
  T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests", case: "already-enrolled", actor: "student" }, r, [200, 201, 409, 422], "");
  const erId = D(r)?.id;
  if (erId) {
    r = await call("www", "POST", `/api/v1/enrollment-requests/${erId}/approve`, { actor: "centerAdminAlien", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests/[id]/approve", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/enrollment-requests/${erId}/decline`, { actor: "centerAdmin", body: { reason: `${TAG} probe` } });
    T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests/[id]/decline", case: "happy", actor: "centerAdmin" }, r, [200], "");
    r = await call("www", "DELETE", `/api/v1/enrollment-requests/${erId}`, { actor: "student" });
    T({ app: "www", method: "DELETE", path: "/api/v1/enrollment-requests/[id]", case: "after-decline", actor: "student" }, r, [200, 204, 409, 422], "");
  }

  // ---- counter check-in with an RFC-valid session id ----
  const rfcSession = fx.sessionScheduled?.id;
  r = await call("www", "POST", "/api/v1/center/checkin", { actor: "receptionist", body: { studentId: studentUserId, sessionId: rfcSession } });
  T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "happy-or-needs-payment", actor: "receptionist" }, r, [200, 201, 402, 422], "402 needs_payment is the documented uncovered path");
  r = await call("www", "POST", "/api/v1/center/checkin", { actor: "centerAdminAlien", body: { studentId: studentUserId, sessionId: rfcSession } });
  T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404, 422], "");
  // the demo seed's non-RFC ids are rejected by z.string().uuid()
  r = await call("www", "POST", "/api/v1/center/checkin", { actor: "receptionist", body: { studentId: studentUserId, sessionId: fx.sessionCompleted?.id } });
  T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "seed-id-not-rfc-uuid", actor: "receptionist" }, r, [400], `seeded id ${fx.sessionCompleted?.id} fails z.string().uuid() — demo data cannot exercise UUID-validated routes`);

  // ---- parent-links with the right field name ----
  const fam = await call("www", "GET", "/api/v1/me/family-code", { actor: "student" });
  const code = D(fam)?.familyLinkCode ?? D(fam)?.code ?? D(fam)?.familyCode;
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "parent", body: { code } });
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "family-code", actor: "parent" }, r, [200, 201, 409, 422], "family code = instant approval");
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "student", body: { code } });
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "student-cannot-use-code", actor: "student" }, r, [400, 422], "students must use email/phone, not a family code");
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "parent", body: { code: "BOGUS9" } });
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "bad-code", actor: "parent" }, r, [400, 404, 422], "");
  r = await call("www", "POST", "/api/v1/me/family-code/rotate", { actor: "student", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/me/family-code/rotate", case: "happy", actor: "student" }, r, [200, 201], "rotating invalidates the old code");
  const newCode = D(r)?.familyLinkCode ?? D(r)?.code;
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "parent", body: { code } });
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "rotated-code-dead", actor: "parent" }, r, [400, 404, 409, 422], `old code must stop working after rotation (new=${newCode ? "issued" : "?"})`);

  // ---- me/subject-requests is teacher-only ----
  r = await call("www", "POST", "/api/v1/me/subject-requests", { actor: "teacher", body: { suggestedName: `${TAG} subject`, gradeLevelId: fx.gradeLevel?.id, notes: "probe" } });
  T({ app: "www", method: "POST", path: "/api/v1/me/subject-requests", case: "happy", actor: "teacher" }, r, [200, 201], "teacher-only despite living under /me");
  const srId = D(r)?.id;
  if (srId) {
    r = await call("superadmin", "POST", `/api/v1/admin/catalog/subject-requests/${srId}/reject`, { actor: "superadmin", body: { note: `${TAG} api verification` } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/subject-requests/[id]/reject", case: "happy", actor: "superadmin" }, r, [200], "");
  }

  // ---- me/onboarding ----
  const ob = await call("www", "GET", "/api/v1/me/onboarding", { actor: "student" });
  r = await call("www", "PATCH", "/api/v1/me/onboarding", { actor: "student", body: { draft: { step: 1, probe: TAG } } });
  T({ app: "www", method: "PATCH", path: "/api/v1/me/onboarding", case: "save-draft", actor: "student" }, r, [200], "");
  r = await call("www", "POST", "/api/v1/me/onboarding", { actor: "student", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/me/onboarding", case: "invalid-body", actor: "student" }, r, [400, 422], "");
  r = await call("www", "POST", "/api/v1/me/roster/choice", { actor: "student", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/me/roster/choice", case: "invalid-body", actor: "student" }, r, [400, 422], "");
  // restore the onboarding draft
  await call("www", "PATCH", "/api/v1/me/onboarding", { actor: "student", body: { draft: D(ob)?.draft ?? {} } });

  // ---- affiliations ----
  if (fx.affiliation?.id) {
    r = await call("www", "POST", `/api/v1/affiliations/${fx.affiliation.id}/accept`, { actor: "teacherAlien", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/affiliations/[id]/accept", case: "not-the-invitee", actor: "teacherAlien" }, r, [400, 403, 404, 409, 422], "only the invited teacher may accept");
    r = await call("www", "POST", `/api/v1/affiliations/${fx.affiliation.id}/decline`, { actor: "student", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/affiliations/[id]/decline", case: "wrong-role", actor: "student" }, r, [401, 403, 404], "");
    r = await call("www", "DELETE", `/api/v1/affiliations/${fx.affiliation.id}`, { actor: "centerAdminAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/affiliations/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
  }

  // ---- attendance record patch ----
  if (fx.attendance?.id) {
    r = await call("www", "PATCH", `/api/v1/attendance/${fx.attendance.id}`, { actor: "teacherAlien", body: { status: "absent" } });
    T({ app: "www", method: "PATCH", path: "/api/v1/attendance/[id]", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
  }

  // ---- centers/me description cannot be cleared ----
  r = await call("www", "PATCH", "/api/v1/centers/me", { actor: "centerAdmin", body: { description: null } });
  T({ app: "www", method: "PATCH", path: "/api/v1/centers/me", case: "null-description", actor: "centerAdmin" }, r, [200, 400, 422], "description is not nullable — an already-set description cannot be cleared");
  r = await call("www", "PATCH", "/api/v1/centers/me", { actor: "centerAdmin", body: { description: "" } });
  T({ app: "www", method: "PATCH", path: "/api/v1/centers/me", case: "empty-description", actor: "centerAdmin" }, r, [200, 400, 422], "");

  flush("deep-write-2b");
}
main();
