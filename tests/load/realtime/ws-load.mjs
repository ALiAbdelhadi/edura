#!/usr/bin/env bun
/**
 * Load client for the chat WebSocket server (apps/realtime, Socket.IO).
 *
 *   tests/load/realtime/run.sh connect            # how many sockets, how fast can they arrive
 *   tests/load/realtime/run.sh storm              # everyone reconnects at once (a redeploy)
 *   tests/load/realtime/run.sh chat               # message throughput + delivery latency
 *
 * It speaks the real protocol with the real client library and the real options
 * the app uses (`transports: ["websocket"]`, a 60-second HS256 token per
 * connection exactly as GET /api/v1/realtime/token mints it). Virtual users are
 * seeded students; each writes to one of their own teachers, because the server
 * checks that relationship on every send.
 *
 * One Bun process cannot drive 10k sockets and also time them honestly, so the
 * parent shards the users over WORKERS child processes and merges their numbers.
 * Each worker reports its own CPU so a starved client is visible, not assumed.
 *
 * SAFETY: refuses any URL that is not localhost.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

const require = createRequire(path.resolve(import.meta.dir, "../../../apps/erp/package.json"));
const { io } = require("socket.io-client");
const { SignJWT } = require("jose");

const URL_ = process.env.REALTIME_URL ?? "http://localhost:3005";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(URL_)) {
  console.error(`refusing: ${URL_} is not localhost`);
  process.exit(1);
}
const SECRET = process.env.REALTIME_JWT_SECRET;
if (!SECRET) {
  console.error("REALTIME_JWT_SECRET is not set -- start through tests/load/realtime/run.sh");
  process.exit(1);
}
const KEY = new TextEncoder().encode(SECRET);

const args = Object.fromEntries(
  process.argv.slice(3).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "1" : all[i + 1]] : null)).filter(Boolean),
);
const MODE = process.argv[2];
const WORKERS = Number(args.workers ?? 4);
const CENTERS = 20, STUDENTS = 1000, TEACHERS = 10;

// ---------------------------------------------------------------- identities
function lid(t) {
  const h = createHash("md5").update(`edura-load:${t}`).digest("hex");
  const u = `${h.slice(0, 12)}5${h.slice(13, 16)}a${h.slice(17)}`;
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}
function student(g) {
  const c = (g % CENTERS) + 1, s = Math.floor(g / CENTERS) + 1;
  const t = 1 + Math.floor((s % (2 * TEACHERS)) / 2);
  return { id: lid(`student:${c}:${s}`), role: "student", centerId: null, name: `طالب ${c}-${s}`, teacherId: lid(`teacher:${c}:${t}`) };
}
function teacher(i) {
  const c = (i % CENTERS) + 1, t = Math.floor(i / CENTERS) + 1;
  return { id: lid(`teacher:${c}:${t}`), role: "teacher", centerId: null, name: `أ. مدرس ${c}-${t}` };
}
const token = (u) =>
  new SignJWT({ role: u.role, centerId: u.centerId, name: u.name })
    .setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setAudience("edura-realtime").setIssuer("edura")
    .setIssuedAt().setExpirationTime("60s").sign(KEY);

const pct = (arr, p) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(user, stats) {
  const t0 = performance.now();
  const socket = io(URL_, {
    transports: ["websocket"],
    // `--reconnect`: behave like the real client after a redeploy (it retries with
    // backoff up to 10 s) instead of counting a refused first attempt as final.
    reconnection: args.reconnect === "1" || MODE === "chat",
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
    auth: (cb) => token(user).then((tk) => cb({ token: tk })),
  });
  socket.once("connect", () => { stats.connected++; stats.connectMs.push(performance.now() - t0); });
  socket.once("presence:state", () => { stats.ready++; stats.readyMs.push(performance.now() - t0); });
  socket.once("connect_error", (e) => { stats.connectErrors[e.message] = (stats.connectErrors[e.message] ?? 0) + 1; });
  socket.on("disconnect", (why) => { if (!stats.closing) stats.dropped[why] = (stats.dropped[why] ?? 0) + 1; });
  return socket;
}
const newStats = () => ({ connected: 0, ready: 0, connectMs: [], readyMs: [], connectErrors: {}, dropped: {}, closing: false });

// -------------------------------------------------------------------- worker
async function worker(k) {
  const t0 = Number(args.t0);
  const cpu0 = process.cpuUsage(), wall0 = performance.now();
  const stats = newStats();
  const out = { worker: k, mode: MODE };

  if (MODE === "connect" || MODE === "storm") {
    const target = Number(args.target), rate = Number(args.rate), hold = Number(args.hold ?? 30);
    const mine = []; for (let g = k; g < target; g += WORKERS) mine.push(g);
    const sockets = [];
    await sleep(Math.max(0, t0 - Date.now()));
    const began = performance.now();
    if (MODE === "storm") for (const g of mine) sockets.push(open(student(g), stats));
    else {
      const perSec = rate / WORKERS;
      for (let i = 0; i < mine.length; i++) {
        const due = began + (i / perSec) * 1000;
        const wait = due - performance.now(); if (wait > 0) await sleep(wait);
        sockets.push(open(student(mine[i]), stats));
      }
    }
    const deadline = performance.now() + 120_000;
    const settled = () => stats.ready + (args.reconnect === "1" ? 0 : Object.values(stats.connectErrors).reduce((a, b) => a + b, 0));
    while (settled() < mine.length && performance.now() < deadline) await sleep(100);
    out.allReadyMs = performance.now() - began;
    await sleep(hold * 1000);
    stats.closing = true;
    for (const s of sockets) s.close();
    Object.assign(out, { attempted: mine.length, connected: stats.connected, ready: stats.ready, connectErrors: stats.connectErrors, dropped: stats.dropped, connectMs: stats.connectMs, readyMs: stats.readyMs });
  }

  if (MODE === "chat") {
    const senders = Number(args.senders), rates = String(args.rates).split(",").map(Number), step = Number(args.step ?? 45);
    const mine = []; for (let g = k; g < senders; g += WORKERS) mine.push(student(g));
    const deliveryMs = {}; // step -> []
    let currentStep = "warmup";
    const sockets = [];
    if (k === 0) {
      for (let i = 0; i < CENTERS * TEACHERS; i++) {
        const s = open(teacher(i), newStats());
        s.on("message:new", (ev) => {
          const m = /^lt:(\d+):/.exec(ev?.message?.body ?? "");
          if (m) (deliveryMs[currentStep] ??= []).push(Date.now() - Number(m[1]));
        });
        sockets.push(s);
        if (i % 50 === 49) await sleep(250);
      }
    }
    await sleep(Math.max(0, t0 - Date.now()));
    const live = [];
    // 25 per 250 ms per worker: a macOS listen backlog is 128, and a refused socket
    // costs a full client backoff. (Linux, where this deploys, allows 4096.)
    for (let i = 0; i < mine.length; i++) { const s = open(mine[i], stats); s.u = mine[i]; live.push(s); if (i % 25 === 24) await sleep(250); }
    const readyBy = Number(args.warmAt) - 2000 - Date.now() + performance.now();
    while (stats.ready < mine.length && performance.now() < readyBy) await sleep(100);

    const steps = {};
    let seq = 0;
    const send = (s, rec) => {
      const t = performance.now();
      rec.sent++;
      s.timeout(15_000).emit("message:send", { recipientId: s.u.teacherId, body: `lt:${Date.now()}:${k}-${seq++}`, clientId: `${k}-${seq}-${Math.random().toString(36).slice(2, 8)}` }, (err, ack) => {
        if (err) return void rec.timeouts++;
        if (ack?.ok) { rec.ok++; rec.ackMs.push(performance.now() - t); if (ack.duplicate) rec.duplicates++; }
        else rec.failed[ack?.code ?? "unknown"] = (rec.failed[ack?.code ?? "unknown"] ?? 0) + 1;
      });
    };
    const rec = () => ({ sent: 0, ok: 0, timeouts: 0, duplicates: 0, failed: {}, ackMs: [] });

    // warm-up: every sender's first message creates its conversation; timed apart
    const warmStart = Number(args.warmAt);
    await sleep(Math.max(0, warmStart - Date.now()));
    steps.warmup = rec();
    const warmFor = Number(args.warm ?? 40) * 1000;
    for (let i = 0; i < live.length; i++) { send(live[i], steps.warmup); const due = warmStart + ((i + 1) / live.length) * warmFor; const w = due - Date.now(); if (w > 0) await sleep(w); }
    await sleep(8000);

    let cursor = 0;
    const stepsStart = Number(args.stepsAt);
    for (let si = 0; si < rates.length; si++) {
      const name = `r${rates[si]}`; currentStep = name; steps[name] = rec();
      const begin = stepsStart + si * (step + 10) * 1000, end = begin + step * 1000;
      await sleep(Math.max(0, begin - Date.now()));
      const perMs = rates[si] / WORKERS / 1000;
      let issued = 0;
      while (Date.now() < end) {
        const dueCount = Math.floor((Date.now() - begin) * perMs);
        while (issued < dueCount) { send(live[cursor++ % live.length], steps[name]); issued++; }
        await sleep(5);
      }
    }
    await sleep(16_000);
    stats.closing = true;
    for (const s of [...live, ...sockets]) s.close();
    Object.assign(out, { senders: mine.length, ready: stats.ready, connectErrors: stats.connectErrors, dropped: stats.dropped, steps, deliveryMs });
  }

  const cpu = process.cpuUsage(cpu0);
  out.clientCpuPct = ((cpu.user + cpu.system) / 1000 / (performance.now() - wall0)) * 100;
  // To a file, not stdout: `process.exit` right after a multi-megabyte write to a
  // pipe truncates it, and the parent then sees a worker with no result.
  await Bun.write(args.resultFile, JSON.stringify(out));
  process.exit(0);
}

// -------------------------------------------------------------------- parent
async function parent() {
  const t0 = Date.now() + 4000;
  const senders = Number(args.senders ?? 0);
  const connectWindow = MODE === "chat" ? Math.ceil(senders / WORKERS / 100) * 1000 + 25_000 : 0;
  const warmAt = t0 + connectWindow, stepsAt = warmAt + (Number(args.warm ?? 40) + 12) * 1000;
  const extra = ["--t0", String(t0), "--warmAt", String(warmAt), "--stepsAt", String(stepsAt)];
  const results = await Promise.all(
    Array.from({ length: WORKERS }, (_, k) => new Promise((resolve, reject) => {
      const resultFile = path.join(process.env.TMPDIR ?? "/tmp", `edura-ws-load-${process.pid}-${k}.json`);
      const child = spawn(process.execPath, [import.meta.path, MODE, ...process.argv.slice(3), ...extra, "--worker", String(k), "--resultFile", resultFile], { stdio: ["ignore", "inherit", "inherit"] });
      child.on("exit", async (code) => {
        const file = Bun.file(resultFile);
        if (!(await file.exists())) return reject(new Error(`worker ${k} exited ${code} with no result`));
        const data = await file.json();
        await file.delete().catch(() => {});
        resolve(data);
      });
    })),
  );
  const sumObj = (objs) => objs.reduce((a, o) => { for (const [k, v] of Object.entries(o ?? {})) a[k] = (a[k] ?? 0) + v; return a; }, {});
  const f = (n) => (n == null ? "–" : n >= 100 ? n.toFixed(0) : n.toFixed(1));
  const report = { mode: MODE, args, clientCpuPct: results.map((r) => Math.round(r.clientCpuPct)) };

  if (MODE === "connect" || MODE === "storm") {
    const c = results.flatMap((r) => r.connectMs), rd = results.flatMap((r) => r.readyMs);
    Object.assign(report, {
      attempted: results.reduce((a, r) => a + r.attempted, 0), connected: c.length, ready: rd.length,
      connectErrors: sumObj(results.map((r) => r.connectErrors)), droppedWhileHeld: sumObj(results.map((r) => r.dropped)),
      allReadySeconds: Math.max(...results.map((r) => r.allReadyMs)) / 1000,
      connectMs: { p50: pct(c, 50), p95: pct(c, 95), p99: pct(c, 99), max: pct(c, 100) },
      readyMs: { p50: pct(rd, 50), p95: pct(rd, 95), p99: pct(rd, 99), max: pct(rd, 100) },
    });
    console.log(`\n${MODE}: attempted ${report.attempted}  connected ${report.connected}  ready ${report.ready}  all-ready in ${f(report.allReadySeconds)} s`);
    console.log(`  connect ms  p50 ${f(report.connectMs.p50)}  p95 ${f(report.connectMs.p95)}  p99 ${f(report.connectMs.p99)}  max ${f(report.connectMs.max)}`);
    console.log(`  ready ms    p50 ${f(report.readyMs.p50)}  p95 ${f(report.readyMs.p95)}  p99 ${f(report.readyMs.p99)}  max ${f(report.readyMs.max)}   (ready = server finished its 2 DB transactions for this socket)`);
    console.log(`  errors ${JSON.stringify(report.connectErrors)}  dropped while held ${JSON.stringify(report.droppedWhileHeld)}  client CPU % per worker ${report.clientCpuPct.join("/")}`);
  }

  if (MODE === "chat") {
    report.senders = results.reduce((a, r) => a + r.senders, 0); report.ready = results.reduce((a, r) => a + r.ready, 0);
    report.dropped = sumObj(results.map((r) => r.dropped));
    report.steps = {};
    const step = Number(args.step ?? 45);
    console.log(`\nchat: ${report.ready}/${report.senders} senders ready, 200 teachers listening; client CPU % per worker ${report.clientCpuPct.join("/")}; dropped ${JSON.stringify(report.dropped)}\n`);
    console.log("| target msg/s | sent | acked ok | achieved msg/s | failed | timeouts | ack p50 | ack p95 | ack p99 | delivered | delivery p50 | delivery p95 | delivery p99 |");
    console.log("|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const name of Object.keys(results[0].steps)) {
      const recs = results.map((r) => r.steps[name]);
      const ack = recs.flatMap((r) => r.ackMs), del = results.flatMap((r) => r.deliveryMs?.[name] ?? []);
      const row = { sent: recs.reduce((a, r) => a + r.sent, 0), ok: recs.reduce((a, r) => a + r.ok, 0), timeouts: recs.reduce((a, r) => a + r.timeouts, 0),
        duplicates: recs.reduce((a, r) => a + r.duplicates, 0), failed: sumObj(recs.map((r) => r.failed)),
        ackMs: { p50: pct(ack, 50), p95: pct(ack, 95), p99: pct(ack, 99) }, delivered: del.length, deliveryMs: { p50: pct(del, 50), p95: pct(del, 95), p99: pct(del, 99) } };
      report.steps[name] = row;
      const secs = name === "warmup" ? Number(args.warm ?? 40) : step;
      console.log(`| ${name} | ${row.sent} | ${row.ok} | ${f(row.ok / secs)} | ${JSON.stringify(row.failed)} | ${row.timeouts} | ${f(row.ackMs.p50)} | ${f(row.ackMs.p95)} | ${f(row.ackMs.p99)} | ${row.delivered} | ${f(row.deliveryMs.p50)} | ${f(row.deliveryMs.p95)} | ${f(row.deliveryMs.p99)} |`);
    }
  }
  if (args.out) await Bun.write(args.out, JSON.stringify(report));
}

if (args.worker !== undefined) await worker(Number(args.worker));
else await parent();
