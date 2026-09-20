// The double-click at the counter. `POST /center/subscriptions` takes no
// idempotency key, so the only thing between an impatient receptionist and a
// double charge is the database. This fires the SAME cash-for-one-lesson request
// three times at once, for many students, and counts how many were accepted.
//
//   tests/load/lib/serve.sh start erp && k6 run tests/load/money-race.js
//
// PASS = every triple yields at most one 201, and the SQL printed by
// tests/load/lib/money-check.sh shows payments == per-session subscriptions ==
// accepted requests, with zero duplicate (student, session) coverage.
import http from "k6/http";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { ERP, loadSessions, identity, studentId, studentGroups, STUDENTS } from "./lib/common.js";

const sessions = loadSessions("center_staff");
const accepted = new Counter("race_accepted");
const refused = new Counter("race_refused");
const doubleCharged = new Counter("race_double_charged");
const triples = new Counter("race_triples");
const other = new Counter("race_other_status");

export const options = {
  scenarios: { race: { executor: "per-vu-iterations", vus: Number(__ENV.RACE_VUS || 20), iterations: Number(__ENV.RACE_ITERATIONS || 25), maxDuration: "5m" } },
  thresholds: { race_double_charged: ["count==0"] },
  noCookiesReset: true,
};

export default function () {
  const who = identity(sessions, ERP);
  // A window of students per VU so two VUs never race each other by accident:
  // the only concurrency under test is the deliberate triple.
  const s = 1 + ((exec.vu.idInTest * 37 + exec.vu.iterationInInstance * 41 + Number(__ENV.RACE_OFFSET || 0)) % STUDENTS);
  const target = studentGroups(who.c, s).uncovered;
  const body = JSON.stringify({ studentId: studentId(who.c, s), courseId: target.courseId, plan: "per_session", sessionId: target.sessionId, markAttendance: true, paymentMethod: "cash" });
  const p = { headers: { "content-type": "application/json", "x-forwarded-for": who.ip }, timeout: "60s",
    responseCallback: http.expectedStatuses({ min: 200, max: 499 }) };
  const res = http.batch([1, 2, 3].map(() => ["POST", `${ERP}/api/v1/center/subscriptions`, body, p]));
  const ok = res.filter((r) => r.status === 201).length;
  triples.add(1);
  accepted.add(ok);
  refused.add(res.filter((r) => r.status >= 400 && r.status < 500).length);
  other.add(res.filter((r) => r.status !== 201 && !(r.status >= 400 && r.status < 500)).length);
  if (ok > 1) doubleCharged.add(1);
  if (__ENV.RACE_DEBUG) console.log(res.map((r) => r.status).join(","), res[0].body && res[0].body.slice(0, 120));
}
