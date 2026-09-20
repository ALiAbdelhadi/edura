// Shared k6 plumbing for the per-role scenarios.
//
// What a "virtual user" is here: one signed-in person, holding a session cookie
// minted beforehand (lib/mint-sessions.mjs), arriving from their own IP address,
// looking at one screen at a time with a human pause between screens. A "page
// view" is the HTML/RSC request for the route plus the API calls that screen
// fires on mount, sent as a parallel batch the way a browser sends them.
//
// SAFETY: every scenario refuses to start against anything but localhost.

import http from "k6/http";
import exec from "k6/execution";
import crypto from "k6/crypto";
import { sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";

export const ERP = __ENV.ERP_URL || "http://localhost:3003";
export const SA = __ENV.SA_URL || "http://localhost:3006";

for (const u of [ERP, SA]) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(u)) {
    throw new Error(`refusing: ${u} is not localhost. These scenarios never leave this machine.`);
  }
}

// ---------------------------------------------------------------- ramp + steps
export const STEPS = (__ENV.STEPS || "10,50,100,250,500").split(",").map(Number);
export const STEP_SECONDS = Number(__ENV.STEP_SECONDS || 120);
export const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 15);
const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 3);

export function stages() {
  const out = [];
  for (const vus of STEPS) {
    out.push({ duration: `${RAMP_SECONDS}s`, target: vus });
    out.push({ duration: `${STEP_SECONDS - RAMP_SECONDS}s`, target: vus });
  }
  out.push({ duration: "5s", target: 0 });
  return out;
}

// Requests sent while the VU count is still climbing are tagged `ramp` and kept
// out of the per-step numbers, so each step's p95 describes a steady population.
export function currentStep() {
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const i = Math.min(STEPS.length - 1, Math.floor(elapsed / STEP_SECONDS));
  if (elapsed - i * STEP_SECONDS < RAMP_SECONDS) return "ramp";
  return `s${STEPS[i]}`;
}

// ---------------------------------------------------------------------- metrics
const CODES = ["200", "201", "204", "304", "307", "400", "401", "402", "403", "404", "409", "422", "429", "500", "502", "503", "0", "other"];
const statusCount = new Counter("status");
const unexpected = new Rate("unexpected");
export const moneyOk = new Counter("money_writes_ok");
export const moneyUnknown = new Counter("money_writes_unknown");
export const moneyRefused = new Counter("money_writes_refused");

// k6 only reports a tagged sub-metric if a threshold names it, so every
// (step x status) and (step x duration) cell of the report is declared here. The
// thresholds are always-true: this file measures, it does not gate.
export function options(endpointNames, extra = {}) {
  const thresholds = {};
  for (const vus of STEPS) {
    const s = `s${vus}`;
    thresholds[`http_req_duration{step:${s}}`] = ["p(95)>=0"];
    thresholds[`http_reqs{step:${s}}`] = ["count>=0"];
    thresholds[`unexpected{step:${s}}`] = ["rate>=0"];
    thresholds[`iterations{step:${s}}`] = ["count>=0"];
    for (const c of CODES) thresholds[`status{step:${s},code:${c}}`] = ["count>=0"];
  }
  for (const n of endpointNames) {
    thresholds[`http_req_duration{name:${n}}`] = ["p(95)>=0"];
    thresholds[`http_req_duration{name:${n},step:s${STEPS[0]}}`] = ["p(95)>=0"];
  }
  return {
    scenarios: {
      ramp: { executor: "ramping-vus", startVUs: 0, stages: stages(), gracefulRampDown: "5s", gracefulStop: "30s" },
    },
    thresholds,
    summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
    discardResponseBodies: false,
    noCookiesReset: true,
    insecureSkipTLSVerify: false,
    userAgent: "edura-k6-load/1.0 (localhost only)",
    ...extra,
  };
}

// ------------------------------------------------------------------ identities
export function loadSessions(role) {
  return new SharedArray(`sessions:${role}`, () => JSON.parse(open(import.meta.resolve(`../.sessions/${role}.json`))));
}

// One session + one client IP per VU. 500 VUs over 60 receptionist accounts means
// several VUs share an account -- a shared cookie is fine server-side -- but each
// still arrives from its own address, so the per-IP limiter sees a crowd, which
// is what it would see in production. No limit is raised.
let me = null;
export function identity(sessions, base) {
  if (me) return me;
  const s = sessions[(exec.vu.idInTest - 1) % sessions.length];
  const [name, ...rest] = s.cookie.split("=");
  http.cookieJar().set(base, name, rest.join("="));
  const v = exec.vu.idInTest;
  me = { ...s, ip: `10.${(v >> 16) & 255}.${(v >> 8) & 255}.${(v & 255) || 1}`, base };
  return me;
}

// ------------------------------------------------------------------- requests
const OK = http.expectedStatuses({ min: 200, max: 399 });
http.setResponseCallback(OK);

function params(who, name, step, extra) {
  return {
    headers: { "x-forwarded-for": who.ip, accept: "application/json", ...(extra && extra.headers) },
    tags: { name, step },
    timeout: "30s",
    redirects: 0,
    responseCallback: extra && extra.expect ? http.expectedStatuses(...extra.expect) : OK,
  };
}

function record(res, step, expect) {
  const code = res.status;
  const known = CODES.indexOf(String(code)) >= 0 ? String(code) : "other";
  statusCount.add(1, { step, code: known });
  const fine = expect ? expect.indexOf(code) >= 0 || (code >= 200 && code < 400) : code >= 200 && code < 400;
  unexpected.add(!fine, { step });
  return res;
}

export function get(who, name, path, extra) {
  const step = currentStep();
  return record(http.get(`${who.base}${path}`, params(who, name, step, extra)), step, extra && extra.also);
}

// A screen's mount-time API calls, fired together.
export function batch(who, calls) {
  const step = currentStep();
  const reqs = calls.map(([name, path]) => ["GET", `${who.base}${path}`, null, params(who, name, step)]);
  return http.batch(reqs).map((r) => record(r, step));
}

export function send(who, method, name, path, body, extra) {
  const step = currentStep();
  const p = params(who, name, step, { ...extra, headers: { "content-type": "application/json" } });
  if (extra && extra.also) p.responseCallback = http.expectedStatuses({ min: 200, max: 399 }, ...extra.also);
  const res = http.request(method, `${who.base}${path}`, body === undefined ? null : JSON.stringify(body), p);
  return record(res, step, extra && extra.also);
}

// The HTML for a route. Every page in this app is dynamic (nonce CSP), so this is
// a full server render each time -- nothing here is a cache hit.
// A page that redirects AFTER streaming has begun still answers HTTP 200 -- the
// redirect travels inside the body as NEXT_REDIRECT. On 2026-09-20 every teacher
// page was such a stub (the seed had not marked teachers as onboarded) and the
// status mix looked perfect. So a page only counts if it did not redirect, unless
// the scenario says that route is meant to (`allowRedirect`).
export const streamedRedirects = new Counter("streamed_redirects");
export function page(who, name, path, allowRedirect = false) {
  const res = get(who, name, path, { headers: { accept: "text/html" } });
  if (!allowRedirect && typeof res.body === "string" && res.body.indexOf("NEXT_REDIRECT") !== -1) {
    streamedRedirects.add(1);
    unexpected.add(true, { step: currentStep() });
  }
  return res;
}

export function think() {
  sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
}

export function pick(weights) {
  let r = Math.random() * weights.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of weights) if ((r -= w) <= 0) return v;
  return weights[0][0];
}

export function json(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

// ------------------------------------------------------------ deterministic ids
// Mirrors pg_temp.lid() in seed/load-seed.sql.
export function lid(t) {
  const h = crypto.md5(`edura-load:${t}`, "hex");
  const u = `${h.slice(0, 12)}5${h.slice(13, 16)}a${h.slice(17)}`;
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

export const TEACHERS = Number(__ENV.TEACHERS || 10);
export const STUDENTS = Number(__ENV.STUDENTS || 1000);
const SLOTS = 2 * TEACHERS;

export const centerId = (c) => lid(`center:${c}`);
export const teacherId = (c, t) => lid(`teacher:${c}:${t}`);
export const studentId = (c, s) => lid(`student:${c}:${s}`);
export const courseId = (c, t, k) => lid(`course:${c}:${t}:${k}`);
export const todaySession = (c, t, k) => lid(`session:${courseId(c, t, k)}:0`);
export const slotCourse = (c, slot) => ({ t: 1 + Math.floor(slot / 2), k: 1 + (slot % 2), c });

// A student's two groups: `covered` has a monthly subscription, `uncovered` is
// the one they pay cash for at the counter.
export function studentGroups(c, s) {
  const a = slotCourse(c, s % SLOTS);
  const b = slotCourse(c, (s + TEACHERS) % SLOTS);
  return {
    covered: { courseId: courseId(c, a.t, a.k), sessionId: todaySession(c, a.t, a.k) },
    uncovered: { courseId: courseId(c, b.t, b.k), sessionId: todaySession(c, b.t, b.k) },
  };
}

// Some students enrolled in teacher t's group k.
export function courseStudents(c, t, k, n) {
  const slot = 2 * (t - 1) + (k - 1);
  const out = [];
  const start = Math.floor(Math.random() * (STUDENTS / SLOTS - 1));
  for (let i = 0; out.length < n && i < STUDENTS / SLOTS; i++) {
    const s = slot + SLOTS * ((start + i) % (STUDENTS / SLOTS));
    if (s >= 1 && s <= STUDENTS) out.push(studentId(c, s));
  }
  return out;
}

export function cairoDay(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------- summary
export function summary(role) {
  return (data) => {
    const stamp = __ENV.RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
    const file = `${__ENV.RESULTS_DIR || "tests/load/results"}/${role}-${stamp}.json`;
    const out = { role, steps: STEPS, stepSeconds: STEP_SECONDS, rampSeconds: RAMP_SECONDS, pool: __ENV.LOAD_POOL_MAX || "10", metrics: data.metrics, state: data.state };
    return { [file]: JSON.stringify(out), stdout: `\n[k6] ${role}: wrote ${file}\n` };
  };
}

// The counter arrival, shared by center_staff and center_admin: look the student
// up, ask what they are here for, check them in; if they have no coverage, take
// cash for this one lesson (a real money write) and check them in again.
export function counterArrival(who, c) {
  const s = 1 + Math.floor(Math.random() * STUDENTS);
  const sid = studentId(c, s);
  const groups = studentGroups(c, s);
  const target = Math.random() < 0.5 ? groups.covered : groups.uncovered;

  if (Math.random() < 0.4) {
    get(who, "GET center/checkin/lookup", `/api/v1/center/checkin/lookup?q=${encodeURIComponent(`+2010${String(c * 100000 + s).padStart(8, "0")}`)}`);
  }
  get(who, "GET center/checkin/suggest", `/api/v1/center/checkin/suggest?studentId=${sid}`);

  const first = send(who, "POST", "POST center/checkin", "/api/v1/center/checkin", { studentId: sid, sessionId: target.sessionId }, { also: [402, 409] });
  if (first.status === 402) {
    const pay = send(who, "POST", "POST center/subscriptions (cash)", "/api/v1/center/subscriptions",
      { studentId: sid, courseId: target.courseId, plan: "per_session", sessionId: target.sessionId, markAttendance: false, paymentMethod: "cash" },
      { also: [409, 422] });
    if (pay.status === 201) moneyOk.add(1);
    else if (pay.status === 0 || pay.status >= 500) moneyUnknown.add(1);
    else moneyRefused.add(1);
    if (pay.status === 201 || pay.status === 409) {
      send(who, "POST", "POST center/checkin", "/api/v1/center/checkin", { studentId: sid, sessionId: target.sessionId }, { also: [402, 409] });
    }
  }
  if (Math.random() < 0.3) {
    get(who, "GET center/counter/roster", `/api/v1/center/counter/roster?sessionId=${target.sessionId}`);
  }
}
