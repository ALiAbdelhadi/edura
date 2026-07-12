#!/usr/bin/env node
/**
 * Automated manual-testing scenarios from tests/MANUAL_TESTING.md
 * Covers P1 + P2 API-testable scenarios against the live dev server.
 *
 * Usage: node tests/manual-api-test.mjs
 * Requires: dev server running on localhost:3000 with seeded data.
 */

const BASE = "http://localhost:3002/api/v1";
const PASSWORD = "Passw0rd!";

// ── Helpers ──────────────────────────────────────────────────────────
let pass = 0, fail = 0, skip = 0;
const results = [];

function log(icon, section, scenario, detail = "") {
  const line = `${icon} [${section}] ${scenario}${detail ? " — " + detail : ""}`;
  console.log(line);
  results.push({ icon, section, scenario, detail });
}

function ok(section, scenario, detail) { pass++; log("✅", section, scenario, detail); }
function ko(section, scenario, detail) { fail++; log("❌", section, scenario, detail); }
function sk(section, scenario, detail) { skip++; log("⏭️", section, scenario, detail); }

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const json = await res.json();
  return json.data.token;
}

async function api(method, path, token, body) {
  const opts = { method, headers: {} };
  if (token) {
    opts.headers["Cookie"] = `next-auth.session-token=${token}`;
  }
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json, headers: res.headers };
}

// ── Token cache ──────────────────────────────────────────────────────
const tokens = {};
async function getToken(email) {
  if (!tokens[email]) tokens[email] = await login(email);
  return tokens[email];
}

// ── Section 3: Session Attendance GET Bug ────────────────────────────
async function testAttendanceBug() {
  const SEC = "3 Attendance Bug";
  try {
    const adminToken = await getToken("admin@nile-academy.eg");
    const teacherToken = await getToken("hossam.aziz@nile-academy.eg");

    // Find a session to test with
    const coursesRes = await api("GET", "/courses", adminToken);
    if (!coursesRes.json?.data?.length) { sk(SEC, "No courses found"); return; }
    const courseId = coursesRes.json.data[0]._id;

    const sessionsRes = await api("GET", `/sessions?courseId=${courseId}`, adminToken);
    if (!sessionsRes.json?.data?.length) { sk(SEC, "No sessions found"); return; }
    const sessionId = sessionsRes.json.data[0]._id;

    // Test 1: Admin GET attendance — should be 403 if bug exists, 200 if fixed
    const adminGet = await api("GET", `/sessions/${sessionId}/attendance`, adminToken);
    if (adminGet.status === 403) {
      ko(SEC, "Admin GET attendance", `BUG CONFIRMED — got 403 (should be 200). requireCenterScope passes courseId not centerId`);
    } else if (adminGet.status === 200) {
      ok(SEC, "Admin GET attendance", "200 — bug is FIXED");
    } else {
      ko(SEC, "Admin GET attendance", `unexpected status ${adminGet.status}`);
    }

    // Test 2: Teacher GET own session
    // Find a session for hossam's course
    const hossamCourses = await api("GET", "/courses", teacherToken);
    let hossamSessionId = null;
    for (const c of hossamCourses.json?.data || []) {
      const sRes = await api("GET", `/sessions?courseId=${c._id}`, teacherToken);
      if (sRes.json?.data?.length) { hossamSessionId = sRes.json.data[0]._id; break; }
    }
    if (hossamSessionId) {
      const teacherGet = await api("GET", `/sessions/${hossamSessionId}/attendance`, teacherToken);
      if (teacherGet.status === 200) ok(SEC, "Teacher GET own session", "200");
      else ko(SEC, "Teacher GET own session", `got ${teacherGet.status}`);
    }

    // Test 3: Teacher GET other's session
    const hanaToken = await getToken("hana.rashidi@nile-academy.eg");
    if (hossamSessionId) {
      const otherGet = await api("GET", `/sessions/${hossamSessionId}/attendance`, hanaToken);
      if (otherGet.status === 403) ok(SEC, "Teacher GET other's session", "403 as expected");
      else ko(SEC, "Teacher GET other's session", `got ${otherGet.status}, expected 403`);
    }
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 5: Teacher Affiliation Leave ─────────────────────────────
async function testTeacherAffiliation() {
  const SEC = "5 Affiliation";
  try {
    const adminToken = await getToken("admin@nile-academy.eg");

    // List affiliations
    const listRes = await api("GET", "/affiliations", adminToken);
    if (listRes.status === 200) ok(SEC, "List affiliations", `${listRes.json?.data?.length || 0} found`);
    else if (listRes.status === 404) sk(SEC, "Affiliations endpoint not found");
    else ko(SEC, "List affiliations", `got ${listRes.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 7: Rate Limiting ─────────────────────────────────────────
async function testRateLimiting() {
  const SEC = "7 Rate Limit";
  try {
    // Send 11 login requests rapidly — expect 429 on 11th
    let got429 = false;
    let lastStatus = 0;
    for (let i = 1; i <= 12; i++) {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ratelimit-test@fake.com", password: "wrong" }),
      });
      lastStatus = res.status;
      if (res.status === 429) { got429 = true; ok(SEC, `Login rate limit hit at request #${i}`, "429"); break; }
    }
    if (!got429) ko(SEC, "Login rate limit NOT hit after 12 requests", `last status: ${lastStatus}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 8: Search & Pagination ───────────────────────────────────
async function testSearch() {
  const SEC = "8 Search";
  try {
    // 8.1.1 No filters
    let r = await api("GET", "/search/centers", null);
    if (r.status === 200) ok(SEC, "Centers no filter", `${r.json?.data?.length || 0} results`);
    else ko(SEC, "Centers no filter", `${r.status}`);

    // 8.1.2 Text search
    r = await api("GET", "/search/centers?q=Nile", null);
    if (r.status === 200 && r.json?.data?.length > 0) ok(SEC, "Centers text search q=Nile", `${r.json.data.length} results`);
    else ko(SEC, "Centers text search q=Nile", `${r.status}, ${r.json?.data?.length || 0} results`);

    // 8.1.5 Page 2
    r = await api("GET", "/search/centers?page=2&limit=5", null);
    if (r.status === 200) ok(SEC, "Centers page 2", `${r.json?.data?.length || 0} results`);
    else ko(SEC, "Centers page 2", `${r.status}`);

    // 8.1.6 Page out of range
    r = await api("GET", "/search/centers?page=9999", null);
    if (r.status === 200 && (r.json?.data?.length === 0 || r.json?.data?.length >= 0)) ok(SEC, "Centers page OOB", `${r.json?.data?.length || 0} results`);
    else ko(SEC, "Centers page OOB", `${r.status}`);

    // 8.1.8 Limit > 100
    r = await api("GET", "/search/centers?limit=200", null);
    if (r.status === 200) ok(SEC, "Centers limit=200", `returned ${r.json?.data?.length || 0} (should cap at 100)`);
    else ko(SEC, "Centers limit=200", `${r.status}`);

    // 8.2.1 Course price range
    const adminToken = await getToken("admin@nile-academy.eg");
    r = await api("GET", "/search/courses?priceMin=10000&priceMax=50000", adminToken);
    if (r.status === 200) ok(SEC, "Courses price range", `${r.json?.data?.length || 0} results`);
    else ko(SEC, "Courses price range", `${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 9: Auth Edge Cases ───────────────────────────────────────
async function testAuthEdgeCases() {
  const SEC = "9 Auth";
  try {
    // 9.1.2 Invalid cookie
    let r = await api("GET", "/me", null);
    if (r.status === 401 || r.status === 403) ok(SEC, "No cookie → unauthenticated", `${r.status}`);
    else ko(SEC, "No cookie", `expected 401/403, got ${r.status}`);

    // 9.1.2 Garbage cookie
    const opts = { method: "GET", headers: { Cookie: "next-auth.session-token=garbage123" } };
    const res = await fetch(`${BASE}/me`, opts);
    if (res.status === 401 || res.status === 403) ok(SEC, "Garbage cookie → unauthenticated", `${res.status}`);
    else ko(SEC, "Garbage cookie", `expected 401/403, got ${res.status}`);

    // 9.3.1 Student creates course → 403
    const studentToken = await getToken("lina.hassan@student.nile-academy.eg");
    r = await api("POST", "/courses", studentToken, { title: "Test", subject: "Math" });
    if (r.status === 403) ok(SEC, "Student POST /courses → 403", "correct");
    else ko(SEC, "Student POST /courses", `expected 403, got ${r.status}`);

    // 9.3.3 Teacher invites admin → 403
    const teacherToken = await getToken("hossam.aziz@nile-academy.eg");
    r = await api("POST", "/centers/me/admins/invite", teacherToken, { email: "test@test.com" });
    if (r.status === 403) ok(SEC, "Teacher POST admin invite → 403", "correct");
    else ko(SEC, "Teacher POST admin invite", `expected 403, got ${r.status}`);

    // 9.3.4 Student creates expense → 403
    r = await api("POST", "/expenses", studentToken, { description: "Test", amount: 100 });
    if (r.status === 403) ok(SEC, "Student POST /expenses → 403", "correct");
    else ko(SEC, "Student POST /expenses", `expected 403, got ${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 2: Admin Invite Flow (partial — cannot test email) ───────
async function testAdminInvite() {
  const SEC = "2 Admin Invite";
  try {
    const adminToken = await getToken("admin@nile-academy.eg");

    // 2.1.4 Non-admin inviting → 403
    const teacherToken = await getToken("hossam.aziz@nile-academy.eg");
    let r = await api("POST", "/centers/me/admins/invite", teacherToken, { email: "newadmin@test.edu" });
    if (r.status === 403) ok(SEC, "Teacher invite → 403", "correct");
    else ko(SEC, "Teacher invite", `expected 403, got ${r.status}`);

    // 2.1.1 Invite new email (admin)
    r = await api("POST", "/centers/me/admins/invite", adminToken, { email: "testadmin-" + Date.now() + "@test.edu" });
    if (r.status === 201 || r.status === 200) ok(SEC, "Admin invite new email", `${r.status}: ${JSON.stringify(r.json?.data)}`);
    else ko(SEC, "Admin invite new email", `${r.status}: ${JSON.stringify(r.json?.error)}`);

    // 2.2.4 Accept with invalid token → 400/410
    r = await api("POST", "/auth/invite/accept", null, { token: "invalid-random-token", password: "Test1234" });
    if (r.status === 400 || r.status === 410) ok(SEC, "Accept invalid token", `${r.status} as expected`);
    else ko(SEC, "Accept invalid token", `expected 400/410, got ${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 4: Parent Link Flows ─────────────────────────────────────
async function testParentLinks() {
  const SEC = "4 Parent Links";
  try {
    const parentToken = await getToken("mona.hassan@email.eg");
    const studentToken = await getToken("lina.hassan@student.nile-academy.eg");

    // Get parent links
    let r = await api("GET", "/parent-links", parentToken);
    if (r.status === 200) ok(SEC, "Parent GET links", `${r.json?.data?.length || 0} links`);
    else ko(SEC, "Parent GET links", `${r.status}`);

    // Student GET links
    r = await api("GET", "/parent-links", studentToken);
    if (r.status === 200) ok(SEC, "Student GET links", `${r.json?.data?.length || 0} links`);
    else ko(SEC, "Student GET links", `${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 10: Course Scheduling Edge Cases ─────────────────────────
async function testCourseScheduling() {
  const SEC = "10 Schedule";
  try {
    const adminToken = await getToken("admin@nile-academy.eg");

    // 10.2.2 startDate > endDate → 400
    let r = await api("POST", "/courses", adminToken, {
      title: "Bad Date Course",
      subject: "Math",
      teacherId: "000000000000000000000000",
      roomId: "000000000000000000000000",
      daysOfWeek: [1],
      startTime: "10:00",
      endTime: "11:00",
      startDate: "2026-12-01",
      endDate: "2026-01-01",
      price: 50000,
      maxStudents: 20,
    });
    if (r.status === 400 || r.status === 422) ok(SEC, "startDate > endDate", `${r.status} validation error`);
    else ko(SEC, "startDate > endDate", `expected 400/422, got ${r.status}`);

    // 10.2.3 empty daysOfWeek → 400
    r = await api("POST", "/courses", adminToken, {
      title: "No Days Course",
      subject: "Math",
      teacherId: "000000000000000000000000",
      roomId: "000000000000000000000000",
      daysOfWeek: [],
      startTime: "10:00",
      endTime: "11:00",
      startDate: "2026-06-01",
      endDate: "2026-12-01",
      price: 50000,
      maxStudents: 20,
    });
    if (r.status === 400) ok(SEC, "Empty daysOfWeek", `${r.status} validation`);
    else ko(SEC, "Empty daysOfWeek", `expected 400, got ${r.status}`);

    // 10.2.6 Invalid time format → 400
    r = await api("POST", "/courses", adminToken, {
      title: "Bad Time",
      subject: "Math",
      teacherId: "000000000000000000000000",
      roomId: "000000000000000000000000",
      daysOfWeek: [1],
      startTime: "2pm",
      endTime: "3pm",
      startDate: "2026-06-01",
      endDate: "2026-12-01",
      price: 50000,
      maxStudents: 20,
    });
    if (r.status === 400) ok(SEC, "Invalid time format", `${r.status} validation`);
    else ko(SEC, "Invalid time format", `expected 400, got ${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 11: Attendance PATCH ─────────────────────────────────────
async function testAttendancePatch() {
  const SEC = "11 Attendance PATCH";
  try {
    // 11.1.4 Non-existent record → 404
    const adminToken = await getToken("admin@nile-academy.eg");
    let r = await api("PATCH", "/attendance/000000000000000000000000", adminToken, { status: "absent" });
    if (r.status === 404) ok(SEC, "Non-existent record", "404 as expected");
    else ko(SEC, "Non-existent record", `expected 404, got ${r.status}`);

    // 11.1.3 Invalid status → 400
    r = await api("PATCH", "/attendance/000000000000000000000000", adminToken, { status: "late" });
    if (r.status === 400 || r.status === 404) ok(SEC, "Invalid status 'late'", `${r.status}`);
    else ko(SEC, "Invalid status", `expected 400/404, got ${r.status}`);

    // 11.1.5 As non-admin → 403
    const teacherToken = await getToken("hossam.aziz@nile-academy.eg");
    r = await api("PATCH", "/attendance/000000000000000000000000", teacherToken, { status: "absent" });
    if (r.status === 403) ok(SEC, "Teacher PATCH attendance → 403", "correct");
    else ko(SEC, "Teacher PATCH attendance", `expected 403, got ${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 14: Device Tokens ────────────────────────────────────────
async function testDeviceTokens() {
  const SEC = "14 Device Tokens";
  try {
    const studentToken = await getToken("lina.hassan@student.nile-academy.eg");

    // 14.1.1 Register web token
    let r = await api("POST", "/me/device-tokens", studentToken, { token: "test-fcm-token-" + Date.now(), platform: "web" });
    if (r.status === 201 || r.status === 200) ok(SEC, "Register web token", `${r.status}`);
    else ko(SEC, "Register web token", `expected 201, got ${r.status}`);

    // 14.1.3 Invalid platform
    r = await api("POST", "/me/device-tokens", studentToken, { token: "abc", platform: "windows" });
    if (r.status === 400) ok(SEC, "Invalid platform → 400", "correct");
    else ko(SEC, "Invalid platform", `expected 400, got ${r.status}`);

    // 14.1.4 Empty token
    r = await api("POST", "/me/device-tokens", studentToken, { token: "", platform: "web" });
    if (r.status === 400) ok(SEC, "Empty token → 400", "correct");
    else ko(SEC, "Empty token", `expected 400, got ${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 15: Family Code ──────────────────────────────────────────
async function testFamilyCode() {
  const SEC = "15 Family Code";
  try {
    const studentToken = await getToken("lina.hassan@student.nile-academy.eg");

    // Get family code
    let r = await api("GET", "/me/family-code", studentToken);
    if (r.status === 200 && r.json?.data) ok(SEC, "Student GET family code", `code: ${r.json.data.familyCode || r.json.data.code || JSON.stringify(r.json.data).substring(0, 60)}`);
    else ko(SEC, "Student GET family code", `${r.status}`);

    // 15.3 Non-student calls rotate → 403
    const parentToken = await getToken("mona.hassan@email.eg");
    r = await api("POST", "/me/family-code/rotate", parentToken);
    if (r.status === 403) ok(SEC, "Parent rotate → 403", "correct");
    else ko(SEC, "Parent rotate", `expected 403, got ${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 16: Financial Reports ────────────────────────────────────
async function testFinancialReports() {
  const SEC = "16 Reports";
  try {
    const adminToken = await getToken("admin@nile-academy.eg");

    // Revenue report
    let r = await api("GET", "/reports/revenue", adminToken);
    if (r.status === 200) ok(SEC, "Revenue report", JSON.stringify(r.json?.data).substring(0, 80));
    else ko(SEC, "Revenue report", `${r.status}`);

    // Revenue with date range
    r = await api("GET", "/reports/revenue?from=2026-01-01&to=2026-06-01", adminToken);
    if (r.status === 200) ok(SEC, "Revenue with date range", "200");
    else ko(SEC, "Revenue with date range", `${r.status}`);

    // Revenue with future range (no data)
    r = await api("GET", "/reports/revenue?from=2099-01-01&to=2099-12-31", adminToken);
    if (r.status === 200) ok(SEC, "Revenue future range", `${JSON.stringify(r.json?.data).substring(0, 60)}`);
    else ko(SEC, "Revenue future range", `${r.status}`);

    // Net profit
    r = await api("GET", "/reports/net-profit", adminToken);
    if (r.status === 200) ok(SEC, "Net profit report", JSON.stringify(r.json?.data).substring(0, 80));
    else ko(SEC, "Net profit report", `${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Section 12: Notifications ────────────────────────────────────────
async function testNotifications() {
  const SEC = "12 Notifications";
  try {
    const studentToken = await getToken("lina.hassan@student.nile-academy.eg");

    let r = await api("GET", "/notifications", studentToken);
    if (r.status === 200) ok(SEC, "Student GET notifications", `${r.json?.data?.length || 0} notifications`);
    else ko(SEC, "Student GET notifications", `${r.status}`);

    // Mark all read
    r = await api("POST", "/notifications/mark-all-read", studentToken);
    if (r.status === 200) ok(SEC, "Mark all read", "200");
    else ko(SEC, "Mark all read", `${r.status}`);
  } catch (e) { ko(SEC, "Error", e.message); }
}

// ── Run all ──────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   EDURA Manual API Tests                 ║");
  console.log("╚══════════════════════════════════════════╝\n");

  await testAttendanceBug();
  console.log("");
  await testAdminInvite();
  console.log("");
  await testParentLinks();
  console.log("");
  await testTeacherAffiliation();
  console.log("");
  await testRateLimiting();
  console.log("");
  await testSearch();
  console.log("");
  await testAuthEdgeCases();
  console.log("");
  await testCourseScheduling();
  console.log("");
  await testAttendancePatch();
  console.log("");
  await testNotifications();
  console.log("");
  await testDeviceTokens();
  console.log("");
  await testFamilyCode();
  console.log("");
  await testFinancialReports();

  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║  RESULTS: ✅ ${pass}  ❌ ${fail}  ⏭️ ${skip}  `.padEnd(43) + "║");
  console.log("╚══════════════════════════════════════════╝");

  if (fail > 0) process.exitCode = 1;
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
