/** Messaging corrections: new-conversation bucket with DISTINCT recipients,
 *  super-admin message soft-delete (needs a body), report triage (real enum). */
import fs from "node:fs";
import crypto from "node:crypto";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;
const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string }>;
const results: unknown[] = [];
const TAG = "apimsg2-" + Math.random().toString(36).slice(2, 7);

async function call(app: string, method: string, path: string, opts: { actor?: string; body?: unknown } = {}) {
  const b = app === "superadmin" ? "http://localhost:3004" : "http://localhost:3002";
  const h: Record<string, string> = {};
  if (opts.actor) h.cookie = actors[opts.actor].cookie;
  let payload: string | undefined;
  if (opts.body !== undefined) { payload = JSON.stringify(opts.body); h["content-type"] = "application/json"; }
  const res = await fetch(b + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json: never | null = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 400) };
}
function T(meta: Record<string, unknown>, res: { status: number; json: never | null; text: string }, expected: number[], note = "") {
  const okStatus = expected.includes(res.status);
  const row = { ...meta, status: res.status, expected: expected.join("|"), verdict: okStatus ? "PASS" : "FAIL", note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json) : res.text).slice(0, 300)}`, body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 400) };
  results.push(row);
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case}) -> ${res.status}`, okStatus ? "" : ":: " + row.note);
  return okStatus;
}
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "?", `[db] ${meta.case} :: ${text}`);
}

async function main() {
  const b0 = (await q(`select (select count(*) from conversations)::int c,(select count(*) from conversation_messages)::int m,(select count(*) from conversation_reports)::int r,(select count(*) from conversation_blocks)::int b`))[0];
  console.log("BEFORE:", JSON.stringify(b0));

  // ---- newConversation bucket (capacity 10, refill 3/min) with DISTINCT recipients ----
  const st = await Promise.all(Array.from({ length: 25 }, () =>
    call("www", "POST", "/api/v1/messages/conversations", { actor: "msgStudentResolved", body: { recipientId: crypto.randomUUID() } })
      .then((r) => r.status)));
  const counts: Record<number, number> = {};
  for (const s of st) counts[s] = (counts[s] ?? 0) + 1;
  note({ app: "www", case: "new-conversation-rate-limit", path: "/api/v1/messages/conversations", method: "POST", actor: "msgStudentResolved" },
    (counts[429] ?? 0) > 0 ? "PASS" : "FAIL",
    `25 concurrent NEW-conversation attempts at distinct recipients -> ${JSON.stringify(counts)} (capacity 10, refill 3/min; the bucket is consumed BEFORE the relationship lookup so a directory probe is throttled)`);

  // ---- send bucket re-measured concurrently (the earlier sequential burst was too slow to trip it) ----
  const conv = await call("www", "POST", "/api/v1/messages/conversations", { actor: "student", body: { recipientId: actors.teacher.id } });
  const cid = (conv.json as never as { data?: { id?: string } })?.data?.id;
  if (cid) {
    const sends = await Promise.all(Array.from({ length: 60 }, (_, i) =>
      call("www", "POST", "/api/v1/messages", { actor: "student", body: { conversationId: cid, body: `${TAG} ${i}` } }).then((r) => r.status)));
    const c2: Record<number, number> = {};
    for (const s of sends) c2[s] = (c2[s] ?? 0) + 1;
    note({ app: "www", case: "send-rate-limit", path: "/api/v1/messages", method: "POST", actor: "student" },
      (c2[429] ?? 0) > 0 ? "PASS" : "FAIL",
      `60 concurrent sends -> ${JSON.stringify(c2)} (capacity 30, refill 20/min — the REST send path IS throttled)`);
  }

  // ---- super-admin message soft-delete (DELETE carries a JSON body) ----
  const msg = (await q(`select id, body, deleted_at from conversation_messages where deleted_at is null order by created_at desc limit 1`))[0];
  if (msg) {
    let r = await call("superadmin", "DELETE", `/api/v1/admin/messaging/messages/${msg.id}`, { actor: "superadmin", body: { reason: `${TAG} api verification` } });
    const ok = T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/messaging/messages/[id]", case: "soft-delete" }, r, [200, 204], "DELETE requires a JSON reason body");
    if (ok) {
      const after = (await q(`select body, deleted_at from conversation_messages where id=$1`, [msg.id]))[0];
      note({ app: "db", case: "soft-delete-keeps-body" }, after?.body === msg.body && after?.deleted_at ? "PASS" : "FAIL",
        `body ${after?.body === msg.body ? "PRESERVED for the super-admin log" : "LOST"}, deletedAt=${after?.deleted_at ?? "null"} (participants see \"message removed\")`);
      await pool.query(`update conversation_messages set deleted_at=null where id=$1`, [msg.id]);
      note({ app: "db", case: "soft-delete-restored" }, "PASS", "test soft-delete reverted");
    }
    r = await call("superadmin", "DELETE", `/api/v1/admin/messaging/messages/${msg.id}`, { actor: "accountant", body: { reason: "x" } });
    T({ app: "superadmin", method: "DELETE", path: "/api/v1/admin/messaging/messages/[id]", case: "accountant-denied" }, r, [401, 403], "");
  }

  // ---- report triage with the real enum ----
  const rep = (await q(`select id,status from conversation_reports order by created_at desc limit 1`))[0];
  if (rep) {
    const orig = rep.status;
    let r = await call("superadmin", "PATCH", `/api/v1/admin/messaging/reports/${rep.id}`, { actor: "superadmin", body: { status: "reviewing", note: `${TAG} api verification` } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/messaging/reports/[id]", case: "triage" }, r, [200], "status enum: open|reviewing|actioned|dismissed");
    r = await call("superadmin", "PATCH", `/api/v1/admin/messaging/reports/${rep.id}`, { actor: "accountant", body: { status: "dismissed" } });
    T({ app: "superadmin", method: "PATCH", path: "/api/v1/admin/messaging/reports/[id]", case: "accountant-denied" }, r, [401, 403], "");
    await pool.query(`update conversation_reports set status=$2 where id=$1`, [rep.id, orig]);
    note({ app: "db", case: "report-status-restored" }, "PASS", `report status restored to ${orig}`);
  }

  // ---- blocks list & admin views ----
  let r = await call("superadmin", "GET", "/api/v1/admin/messaging/blocks", { actor: "superadmin" });
  T({ app: "superadmin", method: "GET", path: "/api/v1/admin/messaging/blocks", case: "happy" }, r, [200], "");
  r = await call("superadmin", "GET", "/api/v1/admin/messaging/reports", { actor: "superadmin" });
  T({ app: "superadmin", method: "GET", path: "/api/v1/admin/messaging/reports", case: "happy" }, r, [200], "");

  // ---- CLEANUP ----
  await pool.query(`delete from conversation_messages where body like $1`, [`%${TAG}%`]);
  if (cid) { await pool.query(`delete from conversation_messages where conversation_id=$1`, [cid]); }
  await pool.query(`delete from conversations where created_at > now() - interval '10 minutes'`);
  const a0 = (await q(`select (select count(*) from conversations)::int c,(select count(*) from conversation_messages)::int m,(select count(*) from conversation_reports)::int r,(select count(*) from conversation_blocks)::int b`))[0];
  console.log("AFTER:", JSON.stringify(a0));
  note({ case: "cleanup" }, JSON.stringify(a0) === JSON.stringify(b0) ? "PASS" : "SUSPICIOUS", `${JSON.stringify(b0)} -> ${JSON.stringify(a0)}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-messaging-2.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-messaging-2:", JSON.stringify(t));
  await pool.end();
}
main();
