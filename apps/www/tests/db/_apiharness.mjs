/**
 * Live API verification harness.
 *
 * Drives the running dev servers (www:3002, superadmin:3004, realtime:3005)
 * with real HTTP requests carrying real NextAuth JWE session cookies minted by
 * _fixtures.ts. Records every call as a row for docs/api-verification.md.
 *
 * READ-BIASED: writes are only performed against demo/seed entities, and every
 * created row is registered for cleanup.
 */
import fs from "node:fs";

export const WWW = "http://localhost:3002";
export const SA = "http://localhost:3004";
export const RT = "http://localhost:3005";

const FIXPATH =
  process.env.FIXTURES ??
  "/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json";

export const FX = JSON.parse(fs.readFileSync(FIXPATH, "utf8"));
export const actors = FX.actors;
export const fx = FX.fixtures;

export const results = [];

function base(app) {
  return app === "superadmin" ? SA : app === "realtime" ? RT : WWW;
}

/** Raw request. actor = key into actors, or null for anonymous. */
export async function call(app, method, path, opts = {}) {
  const { actor = null, body, query, headers = {}, raw = false } = opts;
  let url = base(app) + path;
  if (query && Object.keys(query).length) {
    url += (path.includes("?") ? "&" : "?") + new URLSearchParams(query).toString();
  }
  const h = { ...headers };
  if (actor) {
    const a = actors[actor];
    if (!a) throw new Error(`unknown actor ${actor}`);
    h.cookie = a.cookie;
  }
  let payload;
  if (body !== undefined) {
    if (typeof body === "string") {
      payload = body;
      h["content-type"] = h["content-type"] ?? "text/plain";
    } else if (body instanceof FormData) {
      payload = body;
    } else {
      payload = JSON.stringify(body);
      h["content-type"] = "application/json";
    }
  }
  const started = Date.now();
  let res, text;
  try {
    res = await fetch(url, { method, headers: h, body: payload, redirect: "manual" });
    text = raw ? `<${res.headers.get("content-type")} ${res.headers.get("content-length") ?? "?"}b>` : await res.text();
  } catch (e) {
    return { status: 0, json: null, text: String(e), ms: Date.now() - started, error: String(e) };
  }
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON (pdf/html) */ }
  return {
    status: res.status,
    json,
    text: text.slice(0, 600),
    ct: res.headers.get("content-type"),
    ms: Date.now() - started,
  };
}

/**
 * Record a verification row.
 * verdict: PASS | FAIL | SUSPICIOUS | SKIP
 */
export function record(row) {
  results.push(row);
  const mark = { PASS: "✓", FAIL: "✗", SUSPICIOUS: "?", SKIP: "-" }[row.verdict] ?? "·";
  const line = `${mark} [${row.app}] ${row.method} ${row.path} (${row.case}${row.actor ? "/" + row.actor : ""}) -> ${row.status}`;
  console.log(row.verdict === "PASS" ? line : line + (row.note ? `  :: ${row.note}` : ""));
}

/** Assert a status is in the expected set; auto-records. */
export function check(meta, res, expected, note = "") {
  const exp = Array.isArray(expected) ? expected : [expected];
  const okStatus = exp.includes(res.status);
  record({
    ...meta,
    status: res.status,
    expected: exp.join("|"),
    verdict: okStatus ? "PASS" : "FAIL",
    note: okStatus ? note : `${note} | expected ${exp.join("|")}, got ${res.status}: ${(res.json && JSON.stringify(res.json.error ?? res.json).slice(0, 220)) || res.text.slice(0, 220)}`,
    body: res.json ? JSON.stringify(res.json).slice(0, 400) : res.text.slice(0, 200),
  });
  return okStatus;
}

export function flush(name) {
  const out = `/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-${name}.json`;
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const t = { PASS: 0, FAIL: 0, SUSPICIOUS: 0, SKIP: 0 };
  for (const r of results) t[r.verdict] = (t[r.verdict] ?? 0) + 1;
  console.log(`\n=== ${name}: ${JSON.stringify(t)} -> ${out}`);
}
