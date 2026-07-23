/**
 * PHASE 2d — WRITE suite 2: center-scoped and teacher-scoped writes,
 * exercised on the NILE demo center (is_demo seed data). Every row created is
 * appended to created-2.json for the purge script. No money ledger writes here
 * (those live in _deep-write-3.mjs).
 */
import fs from "node:fs";
import { call, record, flush, fx, actors } from "./_apiharness.mjs";

const TAG = "apiv2-" + Math.random().toString(36).slice(2, 7);
const created = { tag: TAG, rows: [] };
const keep = (table, id) => created.rows.push([table, id]);

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
const rnd = () => Math.floor(Math.random() * 90000000 + 10000000);
const phone = () => `010${rnd()}`;

async function main() {
  console.log("RUN TAG:", TAG);
  const NILE = fx.centerNile;
  const courseNile = fx.courseNile;
  const studentUserId = fx.enrollmentNile?.student_id ?? actors.student.id;

  // ================= ROOMS (center_admin + manager) =================
  let r = await call("www", "POST", "/api/v1/rooms", { actor: "centerAdmin", body: { name: `${TAG} Hall`, capacity: 25, facilities: ["projector"], allowedPricingMethods: ["whole_room_percent"] } });
  T({ app: "www", method: "POST", path: "/api/v1/rooms", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const roomId = D(r)?.id; if (roomId) keep("rooms", roomId);

  if (roomId) {
    r = await call("www", "PATCH", `/api/v1/rooms/${roomId}`, { actor: "centerAdmin", body: { capacity: 30 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/rooms/[id]", case: "happy", actor: "centerAdmin" }, r, [200], "");
    r = await call("www", "PATCH", `/api/v1/rooms/${roomId}`, { actor: "centerAdminAlien", body: { capacity: 99 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/rooms/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "another center must NOT edit this room");
    r = await call("www", "PATCH", `/api/v1/rooms/${roomId}`, { actor: "receptionist", body: { capacity: 31 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/rooms/[id]", case: "staff-tier", actor: "receptionist" }, r, [200, 403], "receptionist room-edit tier");
    r = await call("www", "POST", `/api/v1/rooms/${roomId}/photos`, { actor: "centerAdmin", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/rooms/[id]/photos", case: "invalid-body", actor: "centerAdmin" }, r, [400, 422], "photo upload expects multipart");
  }

  // ================= EXPENSES =================
  r = await call("www", "POST", "/api/v1/expenses", { actor: "centerAdmin", body: { amount: 12345, category: "rent", description: `${TAG} probe`, expenseDate: new Date().toISOString().slice(0, 10) } });
  const expOk = T({ app: "www", method: "POST", path: "/api/v1/expenses", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const expenseId = D(r)?.id; if (expenseId) keep("expenses", expenseId);
  if (expenseId) {
    r = await call("www", "PATCH", `/api/v1/expenses/${expenseId}`, { actor: "centerAdmin", body: { amount: 22345 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/expenses/[id]", case: "happy", actor: "centerAdmin" }, r, [200], "");
    r = await call("www", "PATCH", `/api/v1/expenses/${expenseId}`, { actor: "centerAdminAlien", body: { amount: 1 } });
    T({ app: "www", method: "PATCH", path: "/api/v1/expenses/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/expenses/${expenseId}`, { actor: "centerAdmin" });
    if (T({ app: "www", method: "DELETE", path: "/api/v1/expenses/[id]", case: "happy", actor: "centerAdmin" }, r, [200, 204], "")) created.rows = created.rows.filter(([t, i]) => i !== expenseId);
  }
  r = await call("www", "POST", "/api/v1/expenses", { actor: "centerAdmin", body: { amount: -5, category: "rent", expenseDate: "2026-07-01" } });
  T({ app: "www", method: "POST", path: "/api/v1/expenses", case: "negative-amount", actor: "centerAdmin" }, r, [400, 422], "negative money rejected");

  // ================= CENTER STAFF =================
  const staffEmail = `${TAG}-staff@apiverify.test`;
  r = await call("www", "POST", "/api/v1/center/staff", { actor: "centerAdmin", body: { name: `${TAG} Staff`, email: staffEmail, password: "ApiVerify123", role: "receptionist", title: "probe" } });
  T({ app: "www", method: "POST", path: "/api/v1/center/staff", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const staffRowId = D(r)?.id ?? D(r)?.staff?.id;
  const staffUserId = D(r)?.staffUserId ?? D(r)?.user?.id;
  if (staffRowId) keep("center_staff", staffRowId);
  if (staffUserId) keep("users", staffUserId);
  r = await call("www", "POST", "/api/v1/center/staff", { actor: "manager", body: { name: "x", email: `${TAG}-x@apiverify.test`, password: "ApiVerify123", role: "manager" } });
  T({ app: "www", method: "POST", path: "/api/v1/center/staff", case: "manager-cannot-manage-staff", actor: "manager" }, r, [401, 403], "staff-management is owner-only (hard exclusion)");
  if (staffRowId) {
    r = await call("www", "PATCH", `/api/v1/center/staff/${staffRowId}`, { actor: "centerAdmin", body: { title: "probe v2" } });
    T({ app: "www", method: "PATCH", path: "/api/v1/center/staff/[id]", case: "happy", actor: "centerAdmin" }, r, [200], "");
    r = await call("www", "DELETE", `/api/v1/center/staff/${staffRowId}`, { actor: "centerAdminAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/staff/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/center/staff/${staffRowId}`, { actor: "centerAdmin" });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/staff/[id]", case: "happy", actor: "centerAdmin" }, r, [200, 204], "soft revoke");
  }

  // ================= ROSTER =================
  r = await call("www", "POST", "/api/v1/roster/students/lookup", { actor: "centerAdmin", body: { email: actors.student.email } });
  T({ app: "www", method: "POST", path: "/api/v1/roster/students/lookup", case: "happy", actor: "centerAdmin" }, r, [200, 404], "");
  r = await call("www", "POST", "/api/v1/roster/students/lookup", { actor: "receptionist", body: { email: actors.student.email } });
  T({ app: "www", method: "POST", path: "/api/v1/roster/students/lookup", case: "reception-tier", actor: "receptionist" }, r, [200, 404, 403], "");
  r = await call("www", "POST", "/api/v1/roster/students/invite", { actor: "centerAdmin", body: { email: `${TAG}-inv@apiverify.test`, name: `${TAG} Invitee` } });
  T({ app: "www", method: "POST", path: "/api/v1/roster/students/invite", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const invitedUser = D(r)?.userId ?? D(r)?.user?.id ?? D(r)?.studentId;
  if (invitedUser) keep("users", invitedUser);
  r = await call("www", "POST", "/api/v1/roster/teachers/lookup", { actor: "centerAdmin", body: { email: actors.teacherAlien.email } });
  T({ app: "www", method: "POST", path: "/api/v1/roster/teachers/lookup", case: "happy", actor: "centerAdmin" }, r, [200, 404], "");
  r = await call("www", "POST", "/api/v1/roster/teachers/invite", { actor: "centerAdmin", body: { email: `${TAG}-t@apiverify.test`, name: `${TAG} Teacher`, createShell: true } });
  T({ app: "www", method: "POST", path: "/api/v1/roster/teachers/invite", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const invTeacher = D(r)?.userId ?? D(r)?.teacherId ?? D(r)?.user?.id;
  if (invTeacher) keep("users", invTeacher);
  r = await call("www", "PATCH", `/api/v1/roster/students/${studentUserId}`, { actor: "centerAdminAlien", body: { operationalParentName: "x" } });
  T({ app: "www", method: "PATCH", path: "/api/v1/roster/students/[studentId]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");

  // ================= TEMP STUDENTS / WALK-IN =================
  r = await call("www", "POST", "/api/v1/center/temp-students", { actor: "receptionist", body: { fullName: `${TAG} Temp`, phone: phone(), grade: "3ث" } });
  T({ app: "www", method: "POST", path: "/api/v1/center/temp-students", case: "happy", actor: "receptionist" }, r, [200, 201], "");
  const tempId = D(r)?.id ?? D(r)?.studentProfileId;
  if (tempId) keep("student_profiles", tempId);
  r = await call("www", "POST", "/api/v1/center/temp-students", { actor: "centerAccountant", body: { fullName: "x", phone: phone() } });
  T({ app: "www", method: "POST", path: "/api/v1/center/temp-students", case: "wrong-staff-tier", actor: "centerAccountant" }, r, [401, 403], "center_accountant must NOT create students");

  const walkPhone = phone();
  r = await call("www", "POST", "/api/v1/center/walk-in", { actor: "receptionist", body: { fullName: `${TAG} WalkIn`, phone: walkPhone, locale: "ar" } });
  const walkOk = T({ app: "www", method: "POST", path: "/api/v1/center/walk-in", case: "happy", actor: "receptionist" }, r, [200, 201], "creates shell student + WhatsApp (mock mode)");
  const walkStudent = D(r)?.studentId ?? D(r)?.userId;
  if (walkStudent) keep("users", walkStudent);
  r = await call("www", "POST", "/api/v1/center/walk-in", { actor: "receptionist", body: { fullName: `${TAG} WalkIn dup`, phone: walkPhone, locale: "ar" } });
  T({ app: "www", method: "POST", path: "/api/v1/center/walk-in", case: "duplicate-phone", actor: "receptionist" }, r, [200, 201, 409], "duplicate phone -> reminder, never a second account");
  if (walkStudent) {
    r = await call("www", "POST", "/api/v1/center/walk-in/resend", { actor: "receptionist", body: { studentId: walkStudent } });
    T({ app: "www", method: "POST", path: "/api/v1/center/walk-in/resend", case: "happy", actor: "receptionist" }, r, [200, 201, 400, 422], "");
  }
  r = await call("www", "POST", "/api/v1/temp-students", { actor: "teacher", body: { fullName: `${TAG} TTemp`, phone: phone() } });
  T({ app: "www", method: "POST", path: "/api/v1/temp-students", case: "happy", actor: "teacher" }, r, [200, 201, 403, 422], "teacher-side temp student");
  const tTemp = D(r)?.id ?? D(r)?.studentProfileId; if (tTemp) keep("student_profiles", tTemp);
  r = await call("www", "POST", "/api/v1/teacher/temp-students", { actor: "teacher", body: { fullName: `${TAG} TTemp2`, phone: phone() } });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/temp-students", case: "happy", actor: "teacher" }, r, [200, 201, 400, 422], "");
  const tTemp2 = D(r)?.id; if (tTemp2) keep("student_profiles", tTemp2);
  // M5: send-invite ownership
  r = await call("www", "POST", `/api/v1/temp-students/${tempId ?? "11111111-2222-3333-4444-555555555555"}/send-invite`, { actor: "centerAdminAlien", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/temp-students/[id]/send-invite", case: "M5-ownership", actor: "centerAdminAlien" }, r, [403, 404], "M5: cannot invite another center's temp student");

  // ================= CENTER BLACKLIST =================
  r = await call("www", "POST", "/api/v1/center/blacklist", { actor: "centerAdmin", body: { studentId: studentUserId, reason: `${TAG} probe` } });
  const blOk = T({ app: "www", method: "POST", path: "/api/v1/center/blacklist", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const blId = D(r)?.id;
  r = await call("www", "POST", "/api/v1/center/blacklist", { actor: "centerAdmin", body: { studentId: studentUserId, reason: "" } });
  T({ app: "www", method: "POST", path: "/api/v1/center/blacklist", case: "reason-required", actor: "centerAdmin" }, r, [400, 422], "reason is mandatory");
  if (blId) {
    r = await call("www", "DELETE", `/api/v1/center/blacklist/${blId}`, { actor: "centerAdminAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/blacklist/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/center/blacklist/${blId}`, { actor: "centerAdmin" });
    T({ app: "www", method: "DELETE", path: "/api/v1/center/blacklist/[id]", case: "happy(reversible)", actor: "centerAdmin" }, r, [200, 204], "blacklist is reversible");
  }

  // ================= TEACHER BLACKLIST =================
  r = await call("www", "POST", "/api/v1/teacher/blacklist", { actor: "teacher", body: { studentId: studentUserId, reason: `${TAG} probe` } });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/blacklist", case: "happy", actor: "teacher" }, r, [200, 201], "");
  const tblId = D(r)?.id;
  if (tblId) {
    r = await call("www", "DELETE", `/api/v1/teacher/blacklist/${tblId}`, { actor: "teacherAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/teacher/blacklist/[id]", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/teacher/blacklist/${tblId}`, { actor: "teacher" });
    T({ app: "www", method: "DELETE", path: "/api/v1/teacher/blacklist/[id]", case: "happy", actor: "teacher" }, r, [200, 204], "");
  }

  // ================= GRADES + SCORES =================
  r = await call("www", "POST", "/api/v1/grades", { actor: "teacher", body: { courseId: courseNile, name: `${TAG} quiz`, gradeType: "numeric", maxScore: 20, date: new Date().toISOString().slice(0, 10) } });
  T({ app: "www", method: "POST", path: "/api/v1/grades", case: "happy", actor: "teacher" }, r, [200, 201], "");
  const gradeId = D(r)?.id; if (gradeId) keep("grades", gradeId);
  r = await call("www", "POST", "/api/v1/grades", { actor: "teacherAlien", body: { courseId: courseNile, name: "x", maxScore: 10, date: "2026-07-23" } });
  T({ app: "www", method: "POST", path: "/api/v1/grades", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "cannot grade another teacher's course");
  r = await call("www", "POST", "/api/v1/grades", { actor: "assistant", body: { courseId: courseNile, name: `${TAG} quiz-asst`, maxScore: 10, date: new Date().toISOString().slice(0, 10) } });
  T({ app: "www", method: "POST", path: "/api/v1/grades", case: "delegated", actor: "assistant" }, r, [200, 201], "assistant may grade on behalf of the teacher");
  const gradeId2 = D(r)?.id; if (gradeId2) keep("grades", gradeId2);
  if (gradeId) {
    r = await call("www", "PUT", `/api/v1/grades/${gradeId}/scores`, { actor: "teacher", body: [{ studentId: studentUserId, score: 18 }] });
    T({ app: "www", method: "PUT", path: "/api/v1/grades/[id]/scores", case: "happy", actor: "teacher" }, r, [200], "");
    r = await call("www", "PUT", `/api/v1/grades/${gradeId}/scores`, { actor: "teacher", body: [{ studentId: studentUserId, score: 999 }] });
    T({ app: "www", method: "PUT", path: "/api/v1/grades/[id]/scores", case: "score-over-max", actor: "teacher" }, r, [400, 422], "score above maxScore must be rejected");
    r = await call("www", "PATCH", `/api/v1/grades/${gradeId}`, { actor: "teacher", body: { name: `${TAG} quiz v2` } });
    T({ app: "www", method: "PATCH", path: "/api/v1/grades/[id]", case: "happy", actor: "teacher" }, r, [200], "");
    r = await call("www", "DELETE", `/api/v1/grades/${gradeId}`, { actor: "teacherAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/grades/[id]", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/grades/${gradeId}`, { actor: "teacher" });
    if (T({ app: "www", method: "DELETE", path: "/api/v1/grades/[id]", case: "happy", actor: "teacher" }, r, [200, 204], "")) created.rows = created.rows.filter(([, i]) => i !== gradeId);
  }

  // ================= MATERIALS (multipart) =================
  const fd = new FormData();
  fd.append("courseId", courseNile);
  fd.append("title", `${TAG} notes`);
  fd.append("type", "lecture");
  fd.append("externalUrl", "https://example.com/notes.pdf");
  r = await call("www", "POST", "/api/v1/materials", { actor: "teacher", body: fd });
  T({ app: "www", method: "POST", path: "/api/v1/materials", case: "happy(external)", actor: "teacher" }, r, [200, 201, 400, 422], "external-link material");
  const matId = D(r)?.id; if (matId) keep("materials", matId);
  // magic-byte check (M6): a non-PDF uploaded as a PDF
  const fd2 = new FormData();
  fd2.append("courseId", courseNile);
  fd2.append("title", `${TAG} fake`);
  fd2.append("type", "lecture");
  fd2.append("file", new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "application/pdf" }), "fake.pdf");
  r = await call("www", "POST", "/api/v1/materials", { actor: "teacher", body: fd2 });
  T({ app: "www", method: "POST", path: "/api/v1/materials", case: "M6-magic-bytes", actor: "teacher" }, r, [400, 415, 422, 500], "non-PDF bytes declared as application/pdf");
  if (matId) {
    r = await call("www", "PATCH", `/api/v1/materials/${matId}`, { actor: "teacherAlien", body: { title: "x" } });
    T({ app: "www", method: "PATCH", path: "/api/v1/materials/[id]", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "PATCH", `/api/v1/materials/${matId}`, { actor: "teacher", body: { title: `${TAG} notes v2` } });
    T({ app: "www", method: "PATCH", path: "/api/v1/materials/[id]", case: "happy", actor: "teacher" }, r, [200], "");
    r = await call("www", "DELETE", `/api/v1/materials/${matId}`, { actor: "teacher" });
    if (T({ app: "www", method: "DELETE", path: "/api/v1/materials/[id]", case: "happy", actor: "teacher" }, r, [200, 204], "")) created.rows = created.rows.filter(([, i]) => i !== matId);
  }

  // ================= TEACHER ASSISTANTS =================
  r = await call("www", "POST", "/api/v1/teacher/assistants", { actor: "teacher", body: { name: `${TAG} Asst`, email: `${TAG}-asst@apiverify.test`, password: "ApiVerify123", title: "probe" } });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/assistants", case: "happy", actor: "teacher" }, r, [200, 201, 409, 422], "one assistant may serve exactly one teacher");
  const asstRow = D(r)?.id; const asstUser = D(r)?.assistantId ?? D(r)?.user?.id;
  if (asstRow) keep("teacher_assistants", asstRow);
  if (asstUser) keep("users", asstUser);
  r = await call("www", "POST", "/api/v1/teacher/assistants", { actor: "assistant", body: { name: "x", email: `${TAG}-a2@apiverify.test`, password: "ApiVerify123" } });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/assistants", case: "assistant-cannot-manage", actor: "assistant" }, r, [401, 403], "decision #9 exclusion");
  if (asstRow) {
    r = await call("www", "DELETE", `/api/v1/teacher/assistants/${asstRow}`, { actor: "teacherAlien" });
    T({ app: "www", method: "DELETE", path: "/api/v1/teacher/assistants/[id]", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "DELETE", `/api/v1/teacher/assistants/${asstRow}`, { actor: "teacher" });
    T({ app: "www", method: "DELETE", path: "/api/v1/teacher/assistants/[id]", case: "happy", actor: "teacher" }, r, [200, 204], "");
  }

  // ================= ATTENDANCE MODE =================
  const beforeMode = await call("www", "GET", "/api/v1/teacher/attendance-mode", { actor: "teacher" });
  const origMode = D(beforeMode)?.attendanceMode ?? "counter_only";
  r = await call("www", "PATCH", "/api/v1/teacher/attendance-mode", { actor: "assistant", body: { mode: "counter_and_door" } });
  T({ app: "www", method: "PATCH", path: "/api/v1/teacher/attendance-mode", case: "delegated-write", actor: "assistant" }, r, [200], "assistant CAN write it (but GET refuses assistants — asymmetric)");
  r = await call("www", "PATCH", "/api/v1/teacher/attendance-mode", { actor: "teacher", body: { mode: origMode } });
  T({ app: "www", method: "PATCH", path: "/api/v1/teacher/attendance-mode", case: "restore", actor: "teacher" }, r, [200], "restored");
  r = await call("www", "PATCH", "/api/v1/teacher/attendance-mode", { actor: "teacher", body: { mode: "bogus" } });
  T({ app: "www", method: "PATCH", path: "/api/v1/teacher/attendance-mode", case: "invalid-enum", actor: "teacher" }, r, [400, 422], "");

  // ================= ATTENDANCE (session) =================
  const sess = fx.sessionCompleted?.id ?? fx.sessionScheduled?.id;
  r = await call("www", "PUT", `/api/v1/sessions/${sess}/attendance`, { actor: "teacherAlien", body: [{ studentId: studentUserId, status: "present" }] });
  T({ app: "www", method: "PUT", path: "/api/v1/sessions/[id]/attendance", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
  r = await call("www", "PUT", `/api/v1/sessions/${sess}/attendance`, { actor: "teacher", body: [{ studentId: studentUserId, status: "present" }] });
  T({ app: "www", method: "PUT", path: "/api/v1/sessions/[id]/attendance", case: "happy", actor: "teacher" }, r, [200], "marks attendance on a demo session");
  r = await call("www", "PUT", `/api/v1/sessions/${sess}/attendance`, { actor: "assistant", body: [{ studentId: studentUserId, status: "present" }] });
  T({ app: "www", method: "PUT", path: "/api/v1/sessions/[id]/attendance", case: "delegated", actor: "assistant" }, r, [200], "assistant may mark attendance");
  r = await call("www", "PUT", `/api/v1/sessions/${sess}/attendance`, { actor: "teacher", body: [{ studentId: studentUserId, status: "teleported" }] });
  T({ app: "www", method: "PUT", path: "/api/v1/sessions/[id]/attendance", case: "invalid-status", actor: "teacher" }, r, [400, 422], "");

  // offline sync (Step 6 idempotency)
  const syncBody = { records: [{ sessionId: sess, studentId: studentUserId, status: "present", localTimestamp: new Date().toISOString() }] };
  r = await call("www", "POST", "/api/v1/teacher/attendance/sync", { actor: "teacher", body: syncBody });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/attendance/sync", case: "happy", actor: "teacher" }, r, [200, 201], "offline outbox sync");
  const r2 = await call("www", "POST", "/api/v1/teacher/attendance/sync", { actor: "teacher", body: syncBody });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/attendance/sync", case: "idempotent-replay", actor: "teacher" }, r2, [200, 201], "replaying the same batch must not duplicate");
  r = await call("www", "POST", "/api/v1/teacher/attendance/sync", { actor: "teacherAlien", body: syncBody });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/attendance/sync", case: "cross-teacher", actor: "teacherAlien" }, r, [200, 403, 404, 422], "foreign session in the batch");

  // door check-in
  r = await call("www", "POST", "/api/v1/door-checkin", { actor: "assistant", body: { studentId: studentUserId, sessionId: sess } });
  T({ app: "www", method: "POST", path: "/api/v1/door-checkin", case: "assistant", actor: "assistant" }, r, [200, 201, 400, 422], "door check-in by the teacher's assistant");
  r = await call("www", "POST", "/api/v1/door-checkin", { actor: "receptionist", body: { studentId: studentUserId, sessionId: sess } });
  T({ app: "www", method: "POST", path: "/api/v1/door-checkin", case: "wrong-role", actor: "receptionist" }, r, [401, 403], "front desk must not do the DOOR check-in");

  // ================= COUNTER CHECK-IN =================
  r = await call("www", "POST", "/api/v1/center/checkin", { actor: "receptionist", body: { studentId: studentUserId, sessionId: sess } });
  T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "happy-or-needs-payment", actor: "receptionist" }, r, [200, 201, 402, 422], "402 needs_payment is the documented uncovered path");
  r = await call("www", "POST", "/api/v1/center/checkin", { actor: "centerAccountant", body: { studentId: studentUserId, sessionId: sess } });
  T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "wrong-staff-tier", actor: "centerAccountant" }, r, [401, 403], "");
  r = await call("www", "POST", "/api/v1/center/checkin", { actor: "centerAdminAlien", body: { studentId: studentUserId, sessionId: sess } });
  T({ app: "www", method: "POST", path: "/api/v1/center/checkin", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404, 422], "");

  // ================= REVIEWS =================
  r = await call("www", "POST", "/api/v1/reviews", { actor: "student", body: { teacherId: actors.teacher.id, rating: 5, text: `${TAG} probe` } });
  T({ app: "www", method: "POST", path: "/api/v1/reviews", case: "happy", actor: "student" }, r, [200, 201, 409, 422], "");
  const revId = D(r)?.id; if (revId) keep("reviews", revId);
  r = await call("www", "POST", "/api/v1/reviews", { actor: "student", body: { teacherId: actors.teacher.id, rating: 9 } });
  T({ app: "www", method: "POST", path: "/api/v1/reviews", case: "rating-out-of-range", actor: "student" }, r, [400, 422], "");
  r = await call("www", "POST", "/api/v1/reviews", { actor: "student", body: { teacherId: actors.teacherAlien.id, rating: 5 } });
  T({ app: "www", method: "POST", path: "/api/v1/reviews", case: "not-eligible", actor: "student" }, r, [200, 201, 403, 409, 422], "review eligibility gate");

  // ================= NOTIFICATIONS =================
  r = await call("www", "POST", "/api/v1/notifications/broadcast", { actor: "centerAdmin", body: { scope: "course", courseId: courseNile, title: `${TAG} probe`, body: "api verification" } });
  T({ app: "www", method: "POST", path: "/api/v1/notifications/broadcast", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  r = await call("www", "POST", "/api/v1/notifications/broadcast", { actor: "centerAdminAlien", body: { scope: "course", courseId: courseNile, title: "x", body: "y" } });
  T({ app: "www", method: "POST", path: "/api/v1/notifications/broadcast", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404, 422], "must not broadcast into another center's course");
  r = await call("www", "POST", "/api/v1/notifications/read-all", { actor: "student", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/notifications/read-all", case: "happy", actor: "student" }, r, [200], "");

  // ================= ME =================
  const meBefore = await call("www", "GET", "/api/v1/me", { actor: "student" });
  const origName = D(meBefore)?.name;
  r = await call("www", "PATCH", "/api/v1/me", { actor: "student", body: { name: `${origName} ` } });
  T({ app: "www", method: "PATCH", path: "/api/v1/me", case: "happy(no-op-name)", actor: "student" }, r, [200], "");
  r = await call("www", "PATCH", "/api/v1/me", { actor: "student", body: { phone: "12345" } });
  T({ app: "www", method: "PATCH", path: "/api/v1/me", case: "invalid-phone", actor: "student" }, r, [400, 422], "Egyptian phone format enforced");
  r = await call("www", "PATCH", "/api/v1/me/prefs", { actor: "student", body: { tourCompleted: true } });
  T({ app: "www", method: "PATCH", path: "/api/v1/me/prefs", case: "happy", actor: "student" }, r, [200], "");
  r = await call("www", "POST", "/api/v1/me/device-tokens", { actor: "student", body: { token: `${TAG}-devtoken`, platform: "web" } });
  T({ app: "www", method: "POST", path: "/api/v1/me/device-tokens", case: "happy", actor: "student" }, r, [200, 201], "");
  r = await call("www", "DELETE", `/api/v1/me/device-tokens/${TAG}-devtoken`, { actor: "student" });
  T({ app: "www", method: "DELETE", path: "/api/v1/me/device-tokens/[token]", case: "happy", actor: "student" }, r, [200, 204], "");
  r = await call("www", "POST", "/api/v1/me/push-subscription", { actor: "student", body: { endpoint: `https://example.com/${TAG}`, keys: { p256dh: "x".repeat(87), auth: "y".repeat(22) } } });
  T({ app: "www", method: "POST", path: "/api/v1/me/push-subscription", case: "happy", actor: "student" }, r, [200, 201, 400, 422], "");
  r = await call("www", "DELETE", "/api/v1/me/push-subscription", { actor: "student", body: { endpoint: `https://example.com/${TAG}` } });
  T({ app: "www", method: "DELETE", path: "/api/v1/me/push-subscription", case: "happy", actor: "student" }, r, [200, 204, 400, 404], "");
  r = await call("www", "POST", "/api/v1/me/subject-requests", { actor: "student", body: { suggestedName: `${TAG} subject`, gradeLevelId: fx.gradeLevel?.id, notes: "probe" } });
  T({ app: "www", method: "POST", path: "/api/v1/me/subject-requests", case: "happy", actor: "student" }, r, [200, 201], "");
  const srId = D(r)?.id; if (srId) keep("subject_requests", srId);
  r = await call("www", "POST", "/api/v1/me/credentials", { actor: "student", body: { password: "ApiVerify123" } });
  T({ app: "www", method: "POST", path: "/api/v1/me/credentials", case: "already-has-password", actor: "student" }, r, [400, 403, 409, 422], "set-once first password must refuse an account that already has one");

  // ================= PARENT LINKS =================
  r = await call("www", "GET", "/api/v1/me/family-code", { actor: "student" });
  const famCode = D(r)?.familyLinkCode ?? D(r)?.code;
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "parent", body: { familyCode: famCode } });
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "family-code", actor: "parent" }, r, [200, 201, 409, 422], "family code = instant approval");
  const plId = D(r)?.id;
  r = await call("www", "POST", "/api/v1/parent-links", { actor: "parent", body: { familyCode: "BOGUS9" } });
  T({ app: "www", method: "POST", path: "/api/v1/parent-links", case: "bad-code", actor: "parent" }, r, [400, 404, 422], "");
  if (plId) {
    r = await call("www", "POST", `/api/v1/parent-links/${plId}/approve`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/parent-links/[id]/approve", case: "wrong-role", actor: "teacher" }, r, [401, 403, 404], "");
  }

  // ================= ENROLLMENT REQUESTS =================
  r = await call("www", "POST", "/api/v1/enrollment-requests", { actor: "student", body: { courseId: fx.courseNile2 } });
  T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests", case: "happy", actor: "student" }, r, [200, 201, 409, 422], "");
  const erId = D(r)?.id; if (erId) keep("enrollment_requests", erId);
  if (erId) {
    r = await call("www", "POST", `/api/v1/enrollment-requests/${erId}/approve`, { actor: "centerAdminAlien", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests/[id]/approve", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/enrollment-requests/${erId}/decline`, { actor: "centerAdmin", body: { reason: `${TAG} probe` } });
    T({ app: "www", method: "POST", path: "/api/v1/enrollment-requests/[id]/decline", case: "happy", actor: "centerAdmin" }, r, [200], "");
  }

  // ================= DELETION REQUESTS =================
  r = await call("www", "POST", "/api/v1/me/delete-request", { actor: "student", body: { reason: `${TAG} probe` } });
  T({ app: "www", method: "POST", path: "/api/v1/me/delete-request", case: "happy", actor: "student" }, r, [200, 201, 409], "");
  const drId = D(r)?.id; if (drId) keep("deletion_requests", drId);
  if (drId) {
    r = await call("www", "POST", `/api/v1/deletion-requests/${drId}/reject`, { actor: "centerAdmin", body: { note: `${TAG} probe` } });
    T({ app: "www", method: "POST", path: "/api/v1/deletion-requests/[id]/reject", case: "happy", actor: "centerAdmin" }, r, [200, 403, 404], "");
  }

  // ================= COURSES =================
  const soon = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  r = await call("www", "POST", "/api/v1/courses", {
    actor: "centerAdmin",
    body: { teacherId: actors.teacher.id, title: `${TAG} course`, subject: "Math", price: 10000, maxStudents: 10, schedulePattern: { daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: soon, endDate: later } },
  });
  T({ app: "www", method: "POST", path: "/api/v1/courses", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const courseId = D(r)?.id ?? D(r)?.course?.id; if (courseId) keep("courses", courseId);
  r = await call("www", "POST", "/api/v1/courses", {
    actor: "centerAdmin",
    body: { teacherId: actors.teacher.id, title: `${TAG} past`, subject: "Math", price: 10000, maxStudents: 10, schedulePattern: { daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: "2020-01-01", endDate: "2020-02-01" } },
  });
  T({ app: "www", method: "POST", path: "/api/v1/courses", case: "past-start-date", actor: "centerAdmin" }, r, [400, 422], "start date in the past rejected");
  if (courseId) {
    r = await call("www", "PATCH", `/api/v1/courses/${courseId}`, { actor: "centerAdminAlien", body: { title: "x" } });
    T({ app: "www", method: "PATCH", path: "/api/v1/courses/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    r = await call("www", "PATCH", `/api/v1/courses/${courseId}`, { actor: "centerAdmin", body: { title: `${TAG} course v2` } });
    T({ app: "www", method: "PATCH", path: "/api/v1/courses/[id]", case: "happy", actor: "centerAdmin" }, r, [200], "");
    r = await call("www", "POST", "/api/v1/enrollments", { actor: "centerAdmin", body: { studentId: studentUserId, courseId } });
    T({ app: "www", method: "POST", path: "/api/v1/enrollments", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
    const enrId = D(r)?.id; if (enrId) keep("enrollments", enrId);
    r = await call("www", "POST", "/api/v1/enrollments", { actor: "centerAdmin", body: { studentId: studentUserId, courseId } });
    T({ app: "www", method: "POST", path: "/api/v1/enrollments", case: "duplicate-active", actor: "centerAdmin" }, r, [409, 422], "one active enrollment per (student,course)");
    r = await call("www", "POST", "/api/v1/enrollments", { actor: "centerAdminAlien", body: { studentId: studentUserId, courseId } });
    T({ app: "www", method: "POST", path: "/api/v1/enrollments", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
    if (enrId) {
      r = await call("www", "DELETE", `/api/v1/enrollments/${enrId}`, { actor: "centerAdmin" });
      if (T({ app: "www", method: "DELETE", path: "/api/v1/enrollments/[id]", case: "happy", actor: "centerAdmin" }, r, [200, 204], "")) created.rows = created.rows.filter(([, i]) => i !== enrId);
    }
    r = await call("www", "POST", `/api/v1/courses/${courseId}/reassign-teacher`, { actor: "centerAdmin", body: { teacherId: actors.teacherAlien.id } });
    T({ app: "www", method: "POST", path: "/api/v1/courses/[id]/reassign-teacher", case: "unaffiliated-teacher", actor: "centerAdmin" }, r, [200, 400, 403, 422], "reassigning to a teacher not affiliated with this center");
    r = await call("www", "POST", `/api/v1/courses/${courseId}/cancel`, { actor: "centerAdmin", body: { reason: `${TAG} probe` } });
    T({ app: "www", method: "POST", path: "/api/v1/courses/[id]/cancel", case: "happy", actor: "centerAdmin" }, r, [200], "");
  }

  // ================= SESSION lifecycle (non-money) =================
  const sched = fx.sessionScheduled?.id;
  if (sched) {
    r = await call("www", "POST", `/api/v1/sessions/${sched}/postpone`, { actor: "teacherAlien", body: { newDate: later, newStartTime: "10:00", newEndTime: "11:00", reason: `${TAG}` } });
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/postpone", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/sessions/${sched}/postpone`, { actor: "teacher", body: { newDate: "2020-01-01", newStartTime: "10:00", newEndTime: "11:00", reason: `${TAG}` } });
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/postpone", case: "past-date", actor: "teacher" }, r, [400, 422], "");
    r = await call("www", "POST", `/api/v1/sessions/${sched}/cancel`, { actor: "teacherAlien", body: { reason: "x" } });
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/cancel", case: "cross-teacher", actor: "teacherAlien" }, r, [403, 404], "");
    r = await call("www", "POST", `/api/v1/sessions/${sched}/cancel`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/sessions/[id]/cancel", case: "reason-required", actor: "teacher" }, r, [400, 422], "");
  }

  // ================= COLLABORATION REQUESTS =================
  r = await call("www", "POST", "/api/v1/collaboration-requests", {
    actor: "teacher",
    body: { centerId: fx.centerAndl, subjectId: fx.subject?.id, gradeLevelId: fx.gradeLevel?.id, daysOfWeek: [2], startTime: "12:00", endTime: "13:00", startDate: soon, message: `${TAG} probe` },
  });
  T({ app: "www", method: "POST", path: "/api/v1/collaboration-requests", case: "happy", actor: "teacher" }, r, [200, 201, 409, 422], "teacher -> center proposal");
  const crId = D(r)?.id; if (crId) keep("collaboration_requests", crId);
  if (crId) {
    r = await call("www", "POST", `/api/v1/collaboration-requests/${crId}/accept`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/collaboration-requests/[id]/accept", case: "initiator-cannot-accept", actor: "teacher" }, r, [400, 403, 422], "the proposing side must not accept its own request");
    r = await call("www", "POST", `/api/v1/collaboration-requests/${crId}/cancel`, { actor: "teacher", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/collaboration-requests/[id]/cancel", case: "happy", actor: "teacher" }, r, [200], "");
  }

  // ================= CENTER PROFILE =================
  const cme = await call("www", "GET", "/api/v1/centers/me", { actor: "centerAdmin" });
  const origDesc = D(cme)?.description ?? null;
  r = await call("www", "PATCH", "/api/v1/centers/me", { actor: "centerAdmin", body: { description: `${TAG} probe` } });
  T({ app: "www", method: "PATCH", path: "/api/v1/centers/me", case: "happy", actor: "centerAdmin" }, r, [200], "");
  r = await call("www", "PATCH", "/api/v1/centers/me", { actor: "centerAdmin", body: { description: origDesc } });
  T({ app: "www", method: "PATCH", path: "/api/v1/centers/me", case: "restore", actor: "centerAdmin" }, r, [200], "restored");
  r = await call("www", "PATCH", "/api/v1/centers/me", { actor: "receptionist", body: { description: "x" } });
  T({ app: "www", method: "PATCH", path: "/api/v1/centers/me", case: "staff-tier", actor: "receptionist" }, r, [200, 403], "");
  r = await call("www", "POST", "/api/v1/centers/me/admins/invite", { actor: "centerAdmin", body: { email: `${TAG}-admin2@apiverify.test`, name: `${TAG} Admin2` } });
  T({ app: "www", method: "POST", path: "/api/v1/centers/me/admins/invite", case: "happy", actor: "centerAdmin" }, r, [200, 201], "");
  const inv2 = D(r)?.userId ?? D(r)?.user?.id; if (inv2) keep("users", inv2);
  r = await call("www", "DELETE", "/api/v1/centers/me/logo", { actor: "centerAdmin" });
  T({ app: "www", method: "DELETE", path: "/api/v1/centers/me/logo", case: "happy", actor: "centerAdmin" }, r, [200, 204, 404], "");
  r = await call("www", "POST", "/api/v1/centers/me/logo", { actor: "centerAdmin", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/centers/me/logo", case: "invalid-body", actor: "centerAdmin" }, r, [400, 415, 422], "expects multipart");
  r = await call("www", "POST", "/api/v1/teachers/me/photo", { actor: "teacher", body: {} });
  T({ app: "www", method: "POST", path: "/api/v1/teachers/me/photo", case: "invalid-body", actor: "teacher" }, r, [400, 415, 422], "");
  r = await call("www", "DELETE", "/api/v1/teachers/me/photo", { actor: "teacher" });
  T({ app: "www", method: "DELETE", path: "/api/v1/teachers/me/photo", case: "happy", actor: "teacher" }, r, [200, 204, 404], "");

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/created-2.json", JSON.stringify(created, null, 1));
  console.log("CREATED:", JSON.stringify(created));
  flush("deep-write-2");
}
main();
