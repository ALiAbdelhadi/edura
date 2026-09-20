#!/usr/bin/env bun
/**
 * Turn the artefacts of a run (tests/load/results/<role>-<RUN_ID>.*) into the
 * markdown tables the report quotes. Prints to stdout.
 *
 *   bun tests/load/lib/report.mjs base            # RUN_ID
 *   bun tests/load/lib/report.mjs base student    # one role, with endpoints
 *
 * The knee is computed, not eyeballed: the LAST step at which
 *   unexpected-status rate <= 1%  AND  p95 <= max(3 x the first step's p95, 500 ms).
 * The step after it is "where it breaks".
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const [runId, onlyRole] = process.argv.slice(2);
if (!runId) {
  console.error("usage: report.mjs <RUN_ID> [role]");
  process.exit(1);
}
const dir = path.join(import.meta.dir, "..", "results");
const ROLES = ["center_staff", "center_admin", "teacher", "assistant", "student", "parent", "super_admin", "accountant"];
const f1 = (n) => (n == null || Number.isNaN(n) ? "–" : n >= 100 ? n.toFixed(0) : n.toFixed(1));

function samples(file) {
  if (!existsSync(file)) return [];
  const [head, ...rows] = readFileSync(file, "utf8").trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], i === 0 ? v : Number(v)])));
}

for (const role of ROLES) {
  if (onlyRole && role !== onlyRole) continue;
  const file = path.join(dir, `${role}-${runId}.json`);
  if (!existsSync(file)) continue;
  const run = JSON.parse(readFileSync(file, "utf8"));
  const m = run.metrics;
  const hold = run.stepSeconds - run.rampSeconds;
  const smp = samples(path.join(dir, `${role}-${runId}.samples.csv`));
  // Steps are consecutive stepSeconds windows; the sampler ticks every 5 s.
  const perStep = Math.round(run.stepSeconds / 5);

  const rows = run.steps.map((vus, i) => {
    const s = `s${vus}`;
    const d = m[`http_req_duration{step:${s}}`]?.values ?? {};
    const reqs = m[`http_reqs{step:${s}}`]?.values?.count ?? 0;
    const codes = {};
    for (const [k, v] of Object.entries(m)) {
      const hit = k.match(new RegExp(`^status\\{step:${s},code:(\\w+)\\}$`));
      if (hit && v.values.count > 0) codes[hit[1]] = v.values.count;
    }
    const bad = m[`unexpected{step:${s}}`]?.values?.rate ?? 0;
    const win = smp.slice(i * perStep + Math.ceil(run.rampSeconds / 5), (i + 1) * perStep);
    const avg = (k) => (win.length ? win.reduce((a, r) => a + (r[k] || 0), 0) / win.length : NaN);
    const max = (k) => (win.length ? Math.max(...win.map((r) => r[k] || 0)) : NaN);
    return { vus, rps: reqs / hold, p50: d.med, p95: d["p(95)"], p99: d["p(99)"], bad, codes,
      app: avg("app_cpu_pct"), pg: avg("pg_cpu_pct"), k6: avg("k6_cpu_pct"), active: max("pg_active"), idleTx: max("pg_idle_in_tx"), lock: max("pg_waiting_lock"), conns: max("pg_total") };
  });

  const p95floor = rows[0].p95;
  const limit = Math.max(3 * p95floor, 500);
  let knee = null;
  for (const r of rows) {
    if (r.bad <= 0.01 && r.p95 <= limit) knee = r;
    else break;
  }

  console.log(`\n### ${role}  (pool=${run.pool})\n`);
  console.log("| VUs | req/s | p50 ms | p95 ms | p99 ms | unexpected | status mix | app CPU % | pg CPU % | k6 CPU % | pg conns (max) | active / idle-in-tx / lock-wait (max) |");
  console.log("|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|");
  for (const r of rows) {
    const mix = Object.entries(r.codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c === "0" ? "timeout" : c}:${n}`).join(" ");
    console.log(`| ${r.vus} | ${f1(r.rps)} | ${f1(r.p50)} | ${f1(r.p95)} | ${f1(r.p99)} | ${(100 * r.bad).toFixed(2)}% | ${mix} | ${f1(r.app)} | ${f1(r.pg)} | ${f1(r.k6)} | ${f1(r.conns)} | ${f1(r.active)} / ${f1(r.idleTx)} / ${f1(r.lock)} |`);
  }
  console.log(`\nKnee: ${knee ? `**${knee.vus} VUs, ${f1(knee.rps)} req/s, p95 ${f1(knee.p95)} ms**` : "below the first step"} (limit used: p95 <= ${f1(limit)} ms, unexpected <= 1%).`);
  const money = ["money_writes_ok", "money_writes_unknown", "money_writes_refused"].map((k) => `${k}=${m[k]?.values?.count ?? 0}`).join("  ");
  console.log(`Money counters: ${money}`);
  const sr = m.streamed_redirects?.values?.count ?? 0;
  if (sr > 0) console.log(`**WARNING: ${sr} page views were streamed redirects (HTTP 200 + NEXT_REDIRECT) -- those pages were not really rendered.**`);

  if (onlyRole) {
    console.log("\n| endpoint | p95 ms @ first step | p95 ms whole run | avg ms whole run |\n|---|---:|---:|---:|");
    const names = Object.keys(m).map((k) => k.match(/^http_req_duration\{name:([^,}]+)\}$/)?.[1]).filter(Boolean);
    for (const n of names.sort()) {
      const all = m[`http_req_duration{name:${n}}`].values;
      const first = m[`http_req_duration{name:${n},step:s${run.steps[0]}}`]?.values ?? {};
      console.log(`| ${n} | ${f1(first["p(95)"])} | ${f1(all["p(95)"])} | ${f1(all.avg)} |`);
    }
  }
}
