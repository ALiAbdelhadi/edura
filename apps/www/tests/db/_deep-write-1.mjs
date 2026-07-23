/**
 * PHASE 2c — WRITE suite 1: auth/registration, superadmin catalog + config.
 *
 * Everything created here is tagged with the run tag `apiv-<rand>` and listed
 * in ./_created.json so _purge.ts can delete it. Global settings that get
 * mutated (commission, revenue split) are read first and restored after.
 */
import fs from "node:fs";
import { call, record, flush, fx, actors } from "./_apiharness.mjs";

const TAG = "apiv-" + Math.random().toString(36).slice(2, 8);
const created = { tag: TAG, users: [], centers: [], catalog: {}, misc: [] };
const PW = "ApiVerify123";

function T(meta, res, expected, note = "") {
  const exp = Array.isArray(expected) ? expected : [expected];
  const okStatus = exp.includes(res.status);
  record({
    ...meta, status: res.status, expected: exp.join("|"),
    verdict: okStatus ? "PASS" : "FAIL",
    note: okStatus ? note : `${note ? note + " | " : ""}expected ${exp.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json.error ?? res.json) : res.text).slice(0, 280)}`,
    body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 500),
  });
  return okStatus;
}

async function main() {
  console.log("RUN TAG:", TAG);

  // ============ AUTH / REGISTRATION ============
  const sEmail = `${TAG}-student@apiverify.test`;
  let r = await call("www", "POST", "/api/v1/auth/register/student", {
    body: { email: sEmail, password: PW, name: `${TAG} Student`, locale: "en" },
  });
  T({ app: "www", method: "POST", path: "/api/v1/auth/register/student", case: "happy", actor: null }, r, [200, 201], "public student registration");
  if (r.json?.data?.user?.id || r.json?.data?.id) created.users.push(r.json.data.user?.id ?? r.json.data.id);

  // duplicate email must conflict
  r = await call("www", "POST", "/api/v1/auth/register/student", {
    body: { email: sEmail, password: PW, name: "dup", locale: "en" },
  });
  T({ app: "www", method: "POST", path: "/api/v1/auth/register/student", case: "duplicate-email", actor: null }, r, [409, 422, 400], "duplicate email rejected");

  // weak password must be rejected
  r = await call("www", "POST", "/api/v1/auth/register/student", {
    body: { email: `${TAG}-weak@apiverify.test`, password: "short", name: "x", locale: "en" },
  });
  T({ app: "www", method: "POST", path: "/api/v1/auth/register/student", case: "weak-password", actor: null }, r, [400], "password policy enforced");

  const pEmail = `${TAG}-parent@apiverify.test`;
  r = await call("www", "POST", "/api/v1/auth/register/parent", {
    body: { email: pEmail, password: PW, name: `${TAG} Parent`, locale: "en" },
  });
  T({ app: "www", method: "POST", path: "/api/v1/auth/register/parent", case: "happy", actor: null }, r, [200, 201], "");
  if (r.json?.data) created.users.push(r.json.data.user?.id ?? r.json.data.id);

  const cEmail = `${TAG}-center@apiverify.test`;
  r = await call("www", "POST", "/api/v1/auth/register/center", {
    body: { centerName: `${TAG} Center`, adminName: `${TAG} Admin`, email: cEmail, password: PW, locale: "en" },
  });
  const centerReg = T({ app: "www", method: "POST", path: "/api/v1/auth/register/center", case: "happy", actor: null }, r, [200, 201], "center signs up as PENDING");
  const newCenterId = r.json?.data?.centerId;
  const newCenterAdminId = r.json?.data?.userId;
  if (newCenterId) created.centers.push(newCenterId);
  if (newCenterAdminId) created.users.push(newCenterAdminId);

  // ---- login ----
  r = await call("www", "POST", "/api/v1/auth/login", { body: { email: sEmail, password: PW } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/login", case: "happy", actor: null }, r, [200], "student login");
  r = await call("www", "POST", "/api/v1/auth/login", { body: { email: sEmail, password: "WrongPass123" } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/login", case: "wrong-password", actor: null }, r, [401], "wrong password rejected");
  r = await call("www", "POST", "/api/v1/auth/login", { body: { email: `nobody-${TAG}@nowhere.test`, password: PW } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/login", case: "unknown-email", actor: null }, r, [401], "no enumeration oracle");
  r = await call("www", "POST", "/api/v1/auth/login", { body: { email: actors.superadmin.email, password: PW } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/login", case: "staff-on-www", actor: null }, r, [401], "super_admin must NOT mint a www session");
  r = await call("www", "POST", "/api/v1/auth/login", { body: { email: actors.receptionist.email, password: PW } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/login", case: "center_staff-role-allowlist", actor: null }, r, [401], "center_staff is absent from this route's WWW_ROLES allowlist (NextAuth allows it) — role-allowlist drift");

  r = await call("www", "POST", "/api/v1/auth/password/forgot", { body: { email: sEmail } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/password/forgot", case: "happy", actor: null }, r, [200], "generic response");
  r = await call("www", "POST", "/api/v1/auth/password/forgot", { body: { email: `ghost-${TAG}@nowhere.test` } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/password/forgot", case: "unknown-email", actor: null }, r, [200], "must not reveal existence");
  r = await call("www", "POST", "/api/v1/auth/password/reset", { body: { token: "not-a-real-token", password: PW } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/password/reset", case: "bad-token", actor: null }, r, [400, 404, 410, 422], "invalid reset token rejected");
  r = await call("www", "POST", "/api/v1/auth/invite/accept", { body: { token: "not-a-real-token", password: PW } });
  T({ app: "www", method: "POST", path: "/api/v1/auth/invite/accept", case: "bad-token", actor: null }, r, [400, 404, 410, 422], "invalid invite token rejected");
  r = await call("www", "POST", "/api/v1/temp-students/claim", { actor: "student", body: { code: "NOPE12" } });
  T({ app: "www", method: "POST", path: "/api/v1/temp-students/claim", case: "bad-code", actor: "student" }, r, [400, 404, 422], "invalid claim code rejected");

  // ============ SUPERADMIN: center approval lifecycle ============
  if (newCenterId) {
    r = await call("superadmin", "POST", `/api/v1/admin/centers/${newCenterId}/approve`, { actor: "superadmin", body: {} });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/centers/[id]/approve", case: "happy", actor: "superadmin" }, r, [200, 201], "approve the freshly-registered center");
    r = await call("superadmin", "PATCH", `/api/v1/admin/centers/${newCenterId}/toggle`, { actor: "superadmin", body: { status: "suspended" } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/centers/[id]/toggle", case: "happy", actor: "superadmin" }, r, [200], "suspend");
    r = await call("superadmin", "PATCH", `/api/v1/admin/centers/${newCenterId}/toggle`, { actor: "superadmin", body: { status: "active" } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/centers/[id]/toggle", case: "restore", actor: "superadmin" }, r, [200], "re-activate");
    r = await call("superadmin", "POST", `/api/v1/admin/centers/${newCenterId}/reject`, { actor: "superadmin", body: { reason: "api-verification probe" } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/centers/[id]/reject", case: "already-active", actor: "superadmin" }, r, [200, 409, 422], "reject an already-approved center");
    // put it back to active for the later center-ops suite
    await call("superadmin", "PATCH", `/api/v1/admin/centers/${newCenterId}/toggle`, { actor: "superadmin", body: { status: "active" } });
  }

  // ============ SUPERADMIN: catalog CRUD ============
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/systems", { actor: "superadmin", body: { nameAr: `${TAG} نظام`, nameEn: `${TAG} system`, code: TAG.slice(-6) } });
  const sysOk = T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/systems", case: "happy", actor: "superadmin" }, r, [200, 201], "");
  const sysId = r.json?.data?.id;
  if (sysId) created.catalog.system = sysId;

  if (sysId) {
    r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/systems/${sysId}`, { actor: "superadmin", body: { nameEn: `${TAG} system v2` } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/systems/[id]", case: "happy", actor: "superadmin" }, r, [200], "");

    r = await call("superadmin", "POST", "/api/v1/admin/catalog/stages", { actor: "superadmin", body: { educationSystemId: sysId, nameAr: `${TAG} مرحلة`, nameEn: `${TAG} stage`, order: 1 } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/stages", case: "happy", actor: "superadmin" }, r, [200, 201], "");
    const stageId = r.json?.data?.id;
    if (stageId) created.catalog.stage = stageId;

    if (stageId) {
      r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/stages/${stageId}`, { actor: "superadmin", body: { nameEn: `${TAG} stage v2` } });
      T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/stages/[id]", case: "happy", actor: "superadmin" }, r, [200], "");

      r = await call("superadmin", "POST", "/api/v1/admin/catalog/grade-levels", { actor: "superadmin", body: { stageId, nameAr: `${TAG} صف`, nameEn: `${TAG} grade`, order: 1 } });
      T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/grade-levels", case: "happy", actor: "superadmin" }, r, [200, 201], "");
      const glId = r.json?.data?.id;
      if (glId) created.catalog.gradeLevel = glId;

      if (glId) {
        r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/grade-levels/${glId}`, { actor: "superadmin", body: { nameEn: `${TAG} grade v2` } });
        T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/grade-levels/[id]", case: "happy", actor: "superadmin" }, r, [200], "");

        r = await call("superadmin", "POST", "/api/v1/admin/catalog/tracks", { actor: "superadmin", body: { nameAr: `${TAG} شعبة`, nameEn: `${TAG} track` } });
        T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/tracks", case: "happy", actor: "superadmin" }, r, [200, 201], "");
        const trackId = r.json?.data?.id;
        if (trackId) created.catalog.track = trackId;

        if (trackId) {
          r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/tracks/${trackId}`, { actor: "superadmin", body: { nameEn: `${TAG} track v2` } });
          T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/tracks/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
          r = await call("superadmin", "POST", "/api/v1/admin/catalog/grade-tracks", { actor: "superadmin", body: { gradeLevelId: glId, trackId } });
          T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/grade-tracks", case: "happy", actor: "superadmin" }, r, [200, 201], "");
          const gtId = r.json?.data?.id;
          if (gtId) created.catalog.gradeTrack = gtId;
        }

        r = await call("superadmin", "POST", "/api/v1/admin/catalog/subjects", { actor: "superadmin", body: { nameAr: `${TAG} مادة`, nameEn: `${TAG} subject` } });
        T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/subjects", case: "happy", actor: "superadmin" }, r, [200, 201], "");
        const subjId = r.json?.data?.id;
        if (subjId) created.catalog.subject = subjId;

        if (subjId) {
          r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/subjects/${subjId}`, { actor: "superadmin", body: { nameEn: `${TAG} subject v2` } });
          T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/subjects/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
          r = await call("superadmin", "POST", "/api/v1/admin/catalog/offerings", { actor: "superadmin", body: { gradeLevelId: glId, subjectId: subjId, trackId: created.catalog.track ?? null, isMandatory: true } });
          T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/offerings", case: "happy", actor: "superadmin" }, r, [200, 201], "");
          const offId = r.json?.data?.id;
          if (offId) created.catalog.offering = offId;
          if (offId) {
            r = await call("superadmin", "PATCH", `/api/v1/admin/catalog/offerings/${offId}`, { actor: "superadmin", body: { isMandatory: false } });
            T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/catalog/offerings/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
            r = await call("superadmin", "DELETE", `/api/v1/admin/catalog/offerings/${offId}`, { actor: "superadmin" });
            if (T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/catalog/offerings/[id]", case: "happy", actor: "superadmin" }, r, [200, 204], "")) delete created.catalog.offering;
          }
        }
        if (created.catalog.gradeTrack) {
          r = await call("superadmin", "DELETE", `/api/v1/admin/catalog/grade-tracks/${created.catalog.gradeTrack}`, { actor: "superadmin" });
          if (T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/catalog/grade-tracks/[id]", case: "happy", actor: "superadmin" }, r, [200, 204], "")) delete created.catalog.gradeTrack;
        }
      }
    }
  }

  // catalog write attempted by the accountant -> must be refused
  r = await call("superadmin", "POST", "/api/v1/admin/catalog/systems", { actor: "accountant", body: { nameAr: "x", nameEn: "x", code: "XX" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/catalog/systems", case: "wrong-role", actor: "accountant" }, r, [401, 403], "accountant must not write the catalog");

  // ============ SUPERADMIN: points rules ============
  r = await call("superadmin", "POST", "/api/v1/admin/points/rules", { actor: "superadmin", body: { eventName: `${TAG}_event`, pointsValue: 5, isActive: true } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/admin/points/rules", case: "happy", actor: "superadmin" }, r, [200, 201], "");
  const ruleId = r.json?.data?.id;
  if (ruleId) created.misc.push(["points_rules", ruleId]);
  if (ruleId) {
    r = await call("superadmin", "PATCH", `/api/v1/admin/points/rules/${ruleId}`, { actor: "superadmin", body: { pointsValue: 7 } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/points/rules/[id]", case: "happy", actor: "superadmin" }, r, [200], "");
    r = await call("superadmin", "DELETE", `/api/v1/admin/points/rules/${ruleId}`, { actor: "superadmin" });
    if (T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/points/rules/[id]", case: "happy", actor: "superadmin" }, r, [200, 204], "")) created.misc.pop();
  }

  // points adjust on a DEMO student (points are not the money ledger); reversed right after
  const stu = actors.student.id;
  r = await call("superadmin", "POST", `/api/v1/admin/points/students/${stu}/adjust`, { actor: "superadmin", body: { delta: 5, reason: `${TAG} api verification` } });
  const adjOk = T({ app: "superadmin", method: "POST", path: "/api/v1/admin/points/students/[id]/adjust", case: "happy", actor: "superadmin" }, r, [200, 201], "demo student, reversed immediately");
  if (adjOk) {
    const back = await call("superadmin", "POST", `/api/v1/admin/points/students/${stu}/adjust`, { actor: "superadmin", body: { delta: -5, reason: `${TAG} api verification revert` } });
    T({ app: "superadmin", method: "POST", path: "/api/v1/admin/points/students/[id]/adjust", case: "revert", actor: "superadmin" }, back, [200, 201], "points restored");
  }

  // ============ SUPERADMIN: global money config (read -> mutate -> restore) ============
  const beforeCommission = await call("superadmin", "GET", "/api/v1/admin/commission-settings", { actor: "superadmin" });
  record({ app: "superadmin", method: "GET", path: "/api/v1/admin/commission-settings", case: "before", actor: "superadmin", status: beforeCommission.status, expected: "200", verdict: beforeCommission.status === 200 ? "PASS" : "FAIL", note: "captured for restore", body: JSON.stringify(beforeCommission.json).slice(0, 400) });

  const beforeSplit = await call("superadmin", "GET", "/api/v1/admin/revenue-split", { actor: "superadmin" });
  record({ app: "superadmin", method: "GET", path: "/api/v1/admin/revenue-split", case: "before", actor: "superadmin", status: beforeSplit.status, expected: "200", verdict: beforeSplit.status === 200 ? "PASS" : "FAIL", note: "captured for restore", body: JSON.stringify(beforeSplit.json).slice(0, 400) });

  created.restore = { commission: beforeCommission.json?.data ?? null, split: beforeSplit.json?.data ?? null };

  // invalid split (must not sum to 10000 bp) -> rejected
  r = await call("superadmin", "PUT", "/api/v1/admin/revenue-split", { actor: "superadmin", body: { platformBp: 5000, teacherBp: 5000, centerBp: 5000 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/revenue-split", case: "invalid-sum", actor: "superadmin" }, r, [400, 422], "bp split that does not total 100% must be rejected");

  // accountant must not write the global split
  r = await call("superadmin", "PUT", "/api/v1/admin/revenue-split", { actor: "accountant", body: { platformBp: 1500, teacherBp: 8500, centerBp: 0 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/revenue-split", case: "wrong-role", actor: "accountant" }, r, [401, 403], "revenue split is super_admin-only");

  r = await call("superadmin", "PUT", "/api/v1/admin/commission-settings", { actor: "accountant", body: { platformTeacherFee: 200, platformCenterFee: 200 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/commission-settings", case: "wrong-role", actor: "accountant" }, r, [200, 401, 403], "who may write commission settings?");

  // per-student-rate config (super_admin only)
  r = await call("superadmin", "PUT", "/api/v1/admin/revenue-split/per-student-rate", { actor: "accountant", body: { m2CenterFee: 1000 } });
  T({ app: "superadmin", method: "PUT", path: "/api/v1/admin/revenue-split/per-student-rate", case: "wrong-role", actor: "accountant" }, r, [401, 403], "");

  // ============ SUPERADMIN: notifications ============
  r = await call("superadmin", "POST", "/api/v1/notifications/read-all", { actor: "superadmin", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/notifications/read-all", case: "happy", actor: "superadmin" }, r, [200], "");

  // ============ CRON (secret-guarded) ============
  const secret = fx.secrets?.cronSecret ?? null;
  for (const job of ["lesson-reminders", "expire-payment-intents", "expire-subscriptions", "expire-collaboration-requests"]) {
    const bad = await call("www", "POST", `/api/v1/cron/${job}`, { headers: { "x-cron-secret": "wrong" } });
    T({ app: "www", method: "POST", path: "/api/v1/cron/[job]", case: `bad-secret:${job}`, actor: null }, bad, [401], "wrong cron secret rejected");
    if (secret) {
      const good = await call("www", "POST", `/api/v1/cron/${job}`, { headers: { "x-cron-secret": secret } });
      T({ app: "www", method: "POST", path: "/api/v1/cron/[job]", case: `happy:${job}`, actor: null }, good, [200], "job runs with the right secret");
    }
  }
  const badJob = await call("www", "POST", "/api/v1/cron/not-a-job", { headers: { "x-cron-secret": secret ?? "x" } });
  T({ app: "www", method: "POST", path: "/api/v1/cron/[job]", case: "unknown-job", actor: null }, badJob, [401, 422], "unknown job rejected");
  const getCron = await call("www", "GET", "/api/v1/cron/lesson-reminders", { headers: { "x-cron-secret": secret ?? "x" } });
  T({ app: "www", method: "GET", path: "/api/v1/cron/[job]", case: "get-alias-removed", actor: null }, getCron, [405], "M7: side-effectful GET alias removed");

  // ============ INTERNAL bridge ============
  const bad = await call("www", "POST", "/api/v1/internal/chat-notify", { body: {}, headers: { "x-internal-secret": "wrong" } });
  T({ app: "www", method: "POST", path: "/api/v1/internal/chat-notify", case: "bad-secret", actor: null }, bad, [401, 403], "internal bridge rejects a wrong secret");
  if (fx.secrets?.internalSecret) {
    const good = await call("www", "POST", "/api/v1/internal/chat-notify", { body: {}, headers: { "x-internal-secret": fx.secrets.internalSecret } });
    T({ app: "www", method: "POST", path: "/api/v1/internal/chat-notify", case: "authed-invalid-body", actor: null }, good, [400, 422], "right secret -> validation is the next gate");
  }

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/created.json", JSON.stringify(created, null, 1));
  console.log("CREATED:", JSON.stringify(created));
  flush("deep-write-1");
}
main();
