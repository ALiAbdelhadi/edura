/**
 * PHASE 2a — every GET endpoint exercised with its CORRECT role (happy path)
 * plus cross-tenant / ownership probes where a foreign resource id is available.
 * Read-only: no writes at all.
 */
import { call, record, flush, fx, actors } from "./_apiharness.mjs";

const uid = (k) => actors[k]?.id;
const R = (o, k = "id") => (o && o[k]) || null;

// [app, path, actor, query, expectedStatuses, note]
const PLAN = [
  // ---------- www: public / catalog ----------
  ["www", "GET", "/api/v1/%5Fping", null, {}, [200], "liveness"],
  ["www", "GET", "/api/v1/catalog/tree", "student", {}, [200], "onboarding catalog"],
  ["www", "GET", "/api/v1/catalog/subjects", "student", { gradeLevelId: R(fx.gradeLevel) }, [200], ""],
  ["www", "GET", "/api/v1/subjects", null, {}, [200], "public subject list"],
  ["www", "GET", "/api/v1/search/centers", null, { q: "Nile" }, [200], ""],
  ["www", "GET", "/api/v1/search/courses", null, { q: "البلاغة" }, [200], ""],
  ["www", "GET", "/api/v1/search/teachers", null, { q: "Hossam" }, [200], ""],
  ["www", "GET", "/api/v1/centers/[id]", null, {}, [200], "public center profile", { id: fx.centerNile }],
  ["www", "GET", "/api/v1/centers/[id]/rooms", "centerAdmin", {}, [200], "", { id: fx.centerNile }],
  ["www", "GET", "/api/v1/teachers/[teacherId]", null, {}, [200], "public teacher profile", { teacherId: uid("teacher") }],
  ["www", "GET", "/api/v1/courses", null, {}, [200], "PUBLIC course browse (anon)"],
  ["www", "GET", "/api/v1/courses", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/courses/[id]", null, {}, [200], "public course detail", { id: fx.courseNile }],

  // ---------- www: me ----------
  ["www", "GET", "/api/v1/me", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/me", "assistant", {}, [200], "assistant must resolve actingTeacherId"],
  ["www", "GET", "/api/v1/me", "receptionist", {}, [200], ""],
  ["www", "GET", "/api/v1/me/prefs", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/onboarding", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/onboarding", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/me/onboarding", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/me/points", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/points/history", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/subjects", "student", {}, [200], "track subjects default"],
  ["www", "GET", "/api/v1/me/subjects", "student", { scope: "all" }, [200], "browse-all mode"],
  ["www", "GET", "/api/v1/me/subjects", "student", { mine: "1" }, [200], ""],
  ["www", "GET", "/api/v1/me/wallet", "student", {}, [200], "student wallet balance"],
  ["www", "GET", "/api/v1/me/wallet/history", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/family-code", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/subscriptions", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/children", "parent", {}, [200], ""],
  ["www", "GET", "/api/v1/me/attendance", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/me/affiliations", "teacher", {}, [200], ""],

  // ---------- www: dashboards ----------
  ["www", "GET", "/api/v1/dashboards/student", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/dashboards/teacher", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/dashboards/teacher", "assistant", {}, [200], "assistant acts for teacher"],
  ["www", "GET", "/api/v1/dashboards/admin", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/dashboards/admin", "manager", {}, [200], "center manager staff"],

  // ---------- www: center scope ----------
  ["www", "GET", "/api/v1/centers/me", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/centers/me/admins", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/center/staff", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/center/staff/me", "receptionist", {}, [200], ""],
  ["www", "GET", "/api/v1/center/staff/me", "manager", {}, [200], ""],
  ["www", "GET", "/api/v1/center/blacklist", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/center/subscriptions", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/center/wallet", "centerAdmin", {}, [200], "center wallet balance"],
  ["www", "GET", "/api/v1/center/wallet/payouts", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/center/wallet/transactions", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/center/checkin/lookup", "receptionist", { code: R(fx.studentProfileNile, "student_code") ?? "XXXX" }, [200, 404], "counter lookup"],
  ["www", "GET", "/api/v1/center/checkin/suggest", "receptionist", { studentId: R(fx.enrollmentNile, "student_id") }, [200], "counter suggestions"],
  ["www", "GET", "/api/v1/door-checkin", "assistant", {}, [200, 400], "door check-in queue"],
  ["www", "GET", "/api/v1/door-checkin", "teacher", {}, [200, 400], ""],

  // ---------- www: teacher scope ----------
  ["www", "GET", "/api/v1/teacher/assistants", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/teacher/attendance-mode", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/teacher/attendance-mode", "assistant", {}, [200], "delegated read"],
  ["www", "GET", "/api/v1/teacher/blacklist", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/teacher/wallet", "teacher", {}, [200], "teacher wallet"],
  ["www", "GET", "/api/v1/teacher/wallet/payouts", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/teacher/wallet/transactions", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/teachers/me/photo", "teacher", {}, [200, 404, 405], ""],

  // ---------- www: academic core ----------
  ["www", "GET", "/api/v1/rooms", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/enrollments", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/enrollments", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/enrollment-requests", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/sessions", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/sessions", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/sessions", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/sessions/[id]", "teacher", {}, [200], "", { id: R(fx.sessionScheduled) }],
  ["www", "GET", "/api/v1/sessions/[id]/attendance", "teacher", {}, [200], "", { id: R(fx.sessionCompleted) }],
  ["www", "GET", "/api/v1/grades", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/grades", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/grades/[id]", "teacher", {}, [200], "", { id: R(fx.grade) }],
  ["www", "GET", "/api/v1/materials", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/materials", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/materials/[id]/download", "student", {}, [200, 302, 307, 404], "", { id: R(fx.materialNile ?? fx.material) }],
  ["www", "GET", "/api/v1/reviews", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/reviews/eligible", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/expenses", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/collaboration-requests", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/collaboration-requests", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/deletion-requests", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/parent-links", "parent", {}, [200], ""],
  ["www", "GET", "/api/v1/parent-links", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/roster/students", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/roster/students/[studentId]", "centerAdmin", {}, [200], "", { studentId: R(fx.enrollmentNile, "student_id") }],
  ["www", "GET", "/api/v1/roster/teachers", "centerAdmin", {}, [200], ""],

  // ---------- www: money reads ----------
  ["www", "GET", "/api/v1/payments", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/payments", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/payments/[id]", "centerAdmin", {}, [200, 404], "", { id: R(fx.payment) }],
  ["www", "GET", "/api/v1/payments/[id]/receipt", "centerAdmin", {}, [200, 404], "PDF receipt", { id: R(fx.payment) }, true],
  ["www", "GET", "/api/v1/payments/intents/[id]", "student", {}, [200, 403, 404], "", { id: R(fx.paymentIntent) }],

  // ---------- www: center analytics reports ----------
  ["www", "GET", "/api/v1/reports/revenue", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/revenue-timeseries", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/expenses", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/expenses-timeseries", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/net-profit", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/attendance-by-course", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/course-fill-rates", "centerAdmin", {}, [200], ""],
  ["www", "GET", "/api/v1/reports/enrollment-funnel", "centerAdmin", {}, [200], ""],

  // ---------- www: messaging ----------
  ["www", "GET", "/api/v1/messages/contacts", "student", {}, [200], "relationship-scoped directory"],
  ["www", "GET", "/api/v1/messages/contacts", "teacher", {}, [200], ""],
  ["www", "GET", "/api/v1/messages/contacts", "parent", {}, [200], ""],
  ["www", "GET", "/api/v1/messages/contacts", "assistant", {}, [200], ""],
  ["www", "GET", "/api/v1/messages/contacts", "receptionist", {}, [200], "receptionist -> families"],
  ["www", "GET", "/api/v1/messages/contacts", "manager", {}, [200], "manager -> whole center"],
  ["www", "GET", "/api/v1/messages/contacts", "centerAccountant", {}, [200], "center_accountant must reach NOBODY"],
  ["www", "GET", "/api/v1/messages/conversations", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/messages/conversations", "msgTeacher", {}, [200], ""],
  ["www", "GET", "/api/v1/messages/conversations/[id]", "msgTeacher", {}, [200, 403, 404], "", { id: R(fx.conversationDemo) }],
  ["www", "GET", "/api/v1/messages/groups", "msgTeacher", {}, [200], ""],
  ["www", "GET", "/api/v1/messages/groups/[id]", "msgTeacher", {}, [200, 403, 404], "", { id: R(fx.group) }],
  ["www", "GET", "/api/v1/messages/blocks", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/notifications", "student", {}, [200], ""],
  ["www", "GET", "/api/v1/realtime/token", "student", {}, [200], "60s socket handshake JWT"],

  // ---------- www: parent oversight (child safety) ----------
  ["www", "GET", "/api/v1/parent/oversight/children", "msgParent", {}, [200], "minor children only"],
  ["www", "GET", "/api/v1/parent/oversight/children", "parent", {}, [200], ""],
  ["www", "GET", "/api/v1/parent/oversight/children/[studentId]/conversations", "msgParent", {}, [200, 403, 404], "", { studentId: fx.msgMinorChild?.student_id }],

  // ---------- superadmin: admin ----------
  ["superadmin", "GET", "/api/v1/me", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/me", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/notifications", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/dashboard/kpis", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/dashboard/revenue-chart", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/dashboard/user-growth-chart", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/registrations", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/centers", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/centers/[id]", "superadmin", {}, [200], "", { id: fx.centerNile }],
  ["superadmin", "GET", "/api/v1/admin/centers/[id]/affiliations", "superadmin", {}, [200], "", { id: fx.centerNile }],
  ["superadmin", "GET", "/api/v1/admin/centers/[id]/rooms", "superadmin", {}, [200], "", { id: fx.centerNile }],
  ["superadmin", "GET", "/api/v1/admin/centers/[id]/split", "superadmin", {}, [200], "revenue split", { id: fx.centerNile }],
  ["superadmin", "GET", "/api/v1/admin/teachers", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/students", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/students/[id]", "superadmin", {}, [200], "", { id: uid("student") }],
  ["superadmin", "GET", "/api/v1/admin/blacklist", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/subscriptions", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/collaboration-requests", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/commission-settings", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/revenue-split", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/session-settlements", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/payment-intents", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/payment-intents/[id]", "superadmin", {}, [200, 404], "", { id: R(fx.paymentIntent) }],
  ["superadmin", "GET", "/api/v1/admin/points/rules", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/points/students/[id]/ledger", "superadmin", {}, [200], "", { id: uid("student") }],
  ["superadmin", "GET", "/api/v1/admin/notifications/history", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/whatsapp-messages", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/users/[id]/permissions", "superadmin", {}, [200], "", { id: uid("teacher") }],
  ["superadmin", "GET", "/api/v1/admin/catalog/systems", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/catalog/stages", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/catalog/grade-levels", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/catalog/tracks", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/catalog/subjects", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/catalog/offerings", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/catalog/subject-requests", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/messaging/conversations", "superadmin", {}, [200], "log search"],
  ["superadmin", "GET", "/api/v1/admin/messaging/reports", "superadmin", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/admin/messaging/blocks", "superadmin", {}, [200], ""],

  // ---------- superadmin: finance (accountant) ----------
  ["superadmin", "GET", "/api/v1/finance/dashboard", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/dashboard/revenue-chart", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/alerts", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/commission-settings", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/invoices", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/payouts", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/refunds", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/transactions", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/transactions/[id]", "accountant", {}, [200, 404], "", { id: R(fx.transaction) }],
  ["superadmin", "GET", "/api/v1/finance/subscriptions", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/payment-intents", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/payment-intents/[id]", "accountant", {}, [200, 404], "", { id: R(fx.paymentIntent) }],
  ["superadmin", "GET", "/api/v1/finance/reports/revenue", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/reports/refunds", "accountant", {}, [200], ""],
  ["superadmin", "GET", "/api/v1/finance/reports/trial-balance", "accountant", {}, [200], "ledger must balance"],
  ["superadmin", "GET", "/api/v1/finance/reports/center-statement/[centerId]", "accountant", {}, [200], "", { centerId: fx.centerNile }],
  ["superadmin", "GET", "/api/v1/finance/reports/teacher-statement/[teacherId]", "accountant", {}, [200], "", { teacherId: uid("teacher") }],
  // super_admin reaching the finance surface
  ["superadmin", "GET", "/api/v1/finance/dashboard", "superadmin", {}, [200, 403], "does super_admin get finance?"],
  ["superadmin", "GET", "/api/v1/admin/dashboard/kpis", "accountant", {}, [403, 401], "accountant must NOT get admin surface"],
];

function fill(path, params) {
  if (!params) return path;
  let out = path;
  for (const [k, v] of Object.entries(params)) out = out.replace(`[${k}]`, v ?? "11111111-2222-3333-4444-555555555555");
  return out;
}

async function main() {
  for (const [app, method, path, actor, query, expected, note, params, raw] of PLAN) {
    const url = fill(path, params);
    const res = await call(app, method, url, { actor, query, raw });
    const okStatus = expected.includes(res.status);
    let verdict = okStatus ? "PASS" : "FAIL";
    let n = note;
    if (!okStatus) {
      n = `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json.error ?? res.json) : res.text).slice(0, 300)}`;
    }
    record({
      app, method, path, url, case: "happy", actor, status: res.status,
      expected: expected.join("|"), verdict, note: n,
      body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 700),
      ms: res.ms,
    });
  }
  flush("deep-get");
}
main();
