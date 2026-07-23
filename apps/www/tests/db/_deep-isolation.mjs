/**
 * PHASE 2b — cross-cutting invariants, exercised live over HTTP.
 * Center-vs-center isolation, assistant/staff boundaries, ownership,
 * messaging relationship scoping, child-safety oversight. Read-only.
 */
import { call, record, flush, fx, actors } from "./_apiharness.mjs";

const R = (o, k = "id") => (o && o[k]) || null;
const uid = (k) => actors[k]?.id;

// [label, app, method, path, actor, query, expected(list), note]
const PLAN = [
  // ================= center-vs-center isolation =================
  ["ISO-01", "www", "GET", `/api/v1/courses/${R(fx.courseAlien)}`, "centerAdmin", {}, [200], "public course detail — alien center course (is it public by design?)"],
  ["ISO-02", "www", "GET", `/api/v1/sessions/${R(fx.sessionAlien) ?? R(fx.sessionScheduled)}`, "centerAdminAlien", {}, [200, 403, 404], "alien admin reading own session (control)"],
  ["ISO-03", "www", "GET", `/api/v1/sessions/${R(fx.sessionScheduled)}`, "centerAdminAlien", {}, [403, 404], "OTHER center's admin must NOT read a NILE session"],
  ["ISO-04", "www", "GET", `/api/v1/sessions/${R(fx.sessionScheduled)}/attendance`, "centerAdminAlien", {}, [403, 404], "OTHER center's admin must NOT read NILE attendance"],
  ["ISO-05", "www", "GET", `/api/v1/grades/${R(fx.grade)}`, "centerAdminAlien", {}, [403, 404], "OTHER center's admin must NOT read a NILE grade"],
  ["ISO-06", "www", "GET", `/api/v1/roster/students/${R(fx.enrollmentNile, "student_id")}`, "centerAdminAlien", {}, [403, 404], "OTHER center's admin must NOT read a NILE roster student"],
  ["ISO-07", "www", "GET", `/api/v1/payments/${R(fx.payment)}`, "centerAdminAlien", {}, [403, 404], "OTHER center's admin must NOT read a payment"],
  ["ISO-08", "www", "GET", `/api/v1/payments/${R(fx.payment)}/receipt`, "centerAdminAlien", {}, [403, 404], "OTHER center's admin must NOT pull a receipt PDF"],
  ["ISO-09", "www", "GET", `/api/v1/rooms`, "centerAdminAlien", {}, [200], "rooms list must be scoped to own center"],
  ["ISO-10", "www", "GET", `/api/v1/roster/students`, "centerAdminAlien", {}, [200], "roster list must be scoped to own center"],
  ["ISO-11", "www", "GET", `/api/v1/enrollments`, "centerAdminAlien", {}, [200], "enrollments list scoped"],
  ["ISO-12", "www", "GET", `/api/v1/payments`, "centerAdminAlien", {}, [200], "payments list scoped"],
  ["ISO-13", "www", "GET", `/api/v1/materials/${R(fx.materialNile ?? fx.material)}/download`, "centerAdminAlien", {}, [403, 404], "alien admin must not download NILE material"],
  ["ISO-14", "www", "GET", `/api/v1/dashboards/admin`, "centerAdminAlien", {}, [200], "dashboard scoped to own center"],

  // ================= teacher boundary =================
  ["TCH-01", "www", "GET", `/api/v1/sessions/${R(fx.sessionScheduled)}`, "teacherAlien", {}, [403, 404], "a non-owning teacher must NOT read another teacher's session"],
  ["TCH-02", "www", "GET", `/api/v1/grades/${R(fx.grade)}`, "teacherAlien", {}, [403, 404], "non-owning teacher must NOT read another teacher's grade"],
  ["TCH-03", "www", "GET", `/api/v1/sessions/${R(fx.sessionScheduled)}/attendance`, "teacherAlien", {}, [403, 404], "non-owning teacher must NOT read attendance"],
  ["TCH-04", "www", "GET", `/api/v1/teacher/wallet`, "teacherAlien", {}, [200], "own wallet only"],
  ["TCH-05", "www", "GET", `/api/v1/sessions`, "teacherAlien", {}, [200], "session list scoped to own courses"],

  // ================= assistant boundary =================
  ["AST-01", "www", "GET", "/api/v1/teacher/wallet", "assistant", {}, [403], "assistant must NOT reach wallet/payouts (decision #9 exclusion)"],
  ["AST-02", "www", "GET", "/api/v1/teacher/wallet/payouts", "assistant", {}, [403], "assistant must NOT reach payouts"],
  ["AST-03", "www", "GET", "/api/v1/teacher/wallet/transactions", "assistant", {}, [403], "assistant must NOT reach wallet transactions"],
  ["AST-04", "www", "GET", "/api/v1/teacher/assistants", "assistant", {}, [403], "assistant must NOT manage other assistants"],
  ["AST-05", "www", "GET", "/api/v1/dashboards/teacher", "assistant", {}, [200], "assistant CAN act for its teacher"],
  ["AST-06", "www", "GET", "/api/v1/teacher/attendance-mode", "assistant", {}, [200], "decision #9: attendance-mode is delegated"],
  ["AST-07", "www", "GET", "/api/v1/sessions", "assistant", {}, [200], "assistant sees the teacher's sessions"],

  // ================= center staff boundary =================
  ["STF-01", "www", "GET", "/api/v1/center/wallet", "receptionist", {}, [403], "receptionist must NOT reach center wallet"],
  ["STF-02", "www", "GET", "/api/v1/center/wallet", "centerAccountant", {}, [200, 403], "center_accountant finance tier"],
  ["STF-03", "www", "GET", "/api/v1/center/staff", "receptionist", {}, [403], "receptionist must NOT manage staff"],
  ["STF-04", "www", "GET", "/api/v1/center/staff", "manager", {}, [200, 403], "manager staff-management tier"],
  ["STF-05", "www", "GET", "/api/v1/centers/me/admins", "receptionist", {}, [403], "receptionist must NOT list center admins"],
  ["STF-06", "www", "GET", "/api/v1/messages/contacts", "centerAccountant", {}, [200], "center_accountant is on NO messaging edge -> empty directory"],
  ["STF-07", "www", "GET", "/api/v1/roster/students", "receptionist", {}, [200, 403], "receptionist roster access"],
  ["STF-08", "www", "GET", "/api/v1/reports/revenue", "receptionist", {}, [403], "receptionist must NOT read revenue"],
  ["STF-09", "www", "GET", "/api/v1/expenses", "receptionist", {}, [403], "receptionist must NOT read expenses"],

  // ================= student/parent ownership =================
  ["OWN-01", "www", "GET", `/api/v1/payments/${R(fx.payment)}`, "student", {}, [200, 403, 404], "student reading a payment (must be own)"],
  ["OWN-02", "www", "GET", `/api/v1/payments/${R(fx.payment)}/receipt`, "student", {}, [200, 403, 404], "student receipt"],
  ["OWN-03", "www", "GET", `/api/v1/grades/${R(fx.grade)}`, "student", {}, [200, 403, 404], "student reading a grade"],
  ["OWN-04", "www", "GET", `/api/v1/roster/students/${R(fx.enrollmentNile, "student_id")}`, "student", {}, [403, 404], "a student must NOT read the center roster record"],
  ["OWN-05", "www", "GET", `/api/v1/me/wallet`, "student", {}, [200], "own wallet"],
  ["OWN-06", "www", "GET", `/api/v1/me/children`, "student", {}, [403, 200], "children is a parent surface"],
  ["OWN-07", "www", "GET", `/api/v1/payments/intents/${R(fx.paymentIntent)}`, "student", {}, [403, 404, 200], "intent must belong to caller"],

  // ================= messaging relationship scoping =================
  ["MSG-01", "www", "GET", `/api/v1/messages/conversations/${R(fx.conversationDemo)}`, "student", {}, [403, 404], "a stranger must NOT open someone else's thread"],
  ["MSG-02", "www", "GET", `/api/v1/messages/conversations/${R(fx.conversationDemo)}`, "centerAdmin", {}, [403, 404], "center admin must NOT open a thread they are not in"],
  ["MSG-03", "www", "GET", `/api/v1/messages/groups/${R(fx.group)}`, "student", {}, [403, 404], "non-member must NOT read a group"],
  ["MSG-04", "www", "GET", `/api/v1/messages/groups/${R(fx.group)}`, "centerAdminAlien", {}, [200, 403, 404], "group owner center"],
  ["MSG-05", "www", "GET", "/api/v1/messages/contacts", "student", {}, [200], "student directory = own teachers/parents only"],
  ["MSG-06", "www", "GET", "/api/v1/messages/contacts", "teacherAlien", {}, [200], "teacher directory scoped to own roster"],

  // ================= child safety / parent oversight =================
  ["CS-01", "www", "GET", "/api/v1/parent/oversight/children", "msgParent", {}, [200], "only MINOR children with APPROVED link"],
  ["CS-02", "www", "GET", "/api/v1/parent/oversight/children", "teacher", {}, [403], "non-parent must NOT reach oversight"],
  ["CS-03", "www", "GET", "/api/v1/parent/oversight/children", "student", {}, [403], "student must NOT reach oversight"],
  ["CS-04", "www", "GET", `/api/v1/parent/oversight/children/${uid("student")}/conversations`, "msgParent", {}, [403, 404], "parent must NOT oversee a child that is not theirs"],
  ["CS-05", "www", "GET", `/api/v1/parent/oversight/children/${fx.msgMinorChild?.student_id}/conversations`, "parent", {}, [403, 404], "the OTHER parent must not oversee this child"],

  // ================= superadmin surface separation =================
  ["SA-01", "superadmin", "GET", "/api/v1/admin/dashboard/kpis", "accountant", {}, [401, 403], "accountant must NOT reach the super-admin surface"],
  ["SA-02", "superadmin", "GET", "/api/v1/admin/centers", "accountant", {}, [401, 403], ""],
  ["SA-03", "superadmin", "GET", "/api/v1/admin/students", "accountant", {}, [401, 403], ""],
  ["SA-04", "superadmin", "GET", "/api/v1/admin/messaging/conversations", "accountant", {}, [401, 403], "messaging log is super-admin only"],
  ["SA-05", "superadmin", "GET", "/api/v1/finance/payouts", "superadmin", {}, [200, 403], "does super_admin reach finance?"],
  ["SA-06", "superadmin", "GET", "/api/v1/finance/reports/trial-balance", "superadmin", {}, [200, 403], ""],

  // ================= superadmin id semantics =================
  ["SEM-01", "superadmin", "GET", `/api/v1/admin/students/${R(fx.studentProfileNile)}`, "superadmin", {}, [200], "detail keyed by student_profile id"],
  ["SEM-02", "superadmin", "GET", `/api/v1/admin/students/${uid("student")}`, "superadmin", {}, [404], "same segment with a USER id -> 404 (inconsistent with siblings)"],

  // ================= corrected earlier probes =================
  ["FIX-01", "www", "GET", "/api/v1/_ping", null, {}, [200], "liveness (correct path)"],
  ["FIX-02", "www", "GET", "/api/v1/door-checkin", "assistant", { sessionId: R(fx.sessionScheduled) }, [200, 403, 404], "door queue with sessionId"],
  ["FIX-03", "www", "GET", "/api/v1/door-checkin", "teacher", { sessionId: R(fx.sessionScheduled) }, [200, 403, 404], ""],
  ["FIX-04", "www", "GET", "/api/v1/me/subjects", "teacher", {}, [200], "teacher specialization subjects (not student track)"],
  ["FIX-05", "www", "GET", `/api/v1/centers/${fx.centerNile}/rooms`, "teacher", {}, [200], "teacher-facing room browse"],
];

async function main() {
  for (const [label, app, method, path, actor, query, expected, note] of PLAN) {
    const res = await call(app, method, path, { actor, query });
    const okStatus = expected.includes(res.status);
    record({
      app, method, path, url: path, case: label, actor, status: res.status,
      expected: expected.join("|"),
      verdict: okStatus ? "PASS" : "FAIL",
      note: okStatus ? note : `${note} | expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json.error ?? res.json) : res.text).slice(0, 260)}`,
      body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 900),
    });
  }
  flush("deep-isolation");
}
main();
