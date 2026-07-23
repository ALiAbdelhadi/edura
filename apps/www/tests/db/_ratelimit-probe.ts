/** Focused probe: does the ChatLimiter actually throttle the REST send path? */
import fs from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string }>;
const TAG = "aprl-" + Math.random().toString(36).slice(2, 7);

async function post(path: string, actor: string, body: unknown) {
  const res = await fetch("http://localhost:3002" + path, {
    method: "POST",
    headers: { cookie: actors[actor].cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function main() {
  // open the thread first
  const r = await fetch("http://localhost:3002/api/v1/messages/conversations", {
    method: "POST", headers: { cookie: actors.student.cookie, "content-type": "application/json" },
    body: JSON.stringify({ recipientId: actors.teacher.id }),
  });
  const convId = (await r.json()).data?.id;
  console.log("conversation:", convId, "status", r.status);

  // ---- send bucket: capacity 30, refill 20/min ----
  const t0 = Date.now();
  const statuses = await Promise.all(
    Array.from({ length: 60 }, (_, i) => post("/api/v1/messages", "student", { conversationId: convId, body: `${TAG} ${i}` })),
  );
  const elapsed = Date.now() - t0;
  const counts: Record<number, number> = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  console.log(`SEND burst: 60 CONCURRENT requests in ${elapsed}ms ->`, JSON.stringify(counts));
  console.log(`  expected with capacity=30, refill=20/min: ~30 accepted, ~30 x 429`);

  // ---- newConversation bucket: capacity 10, refill 3/min ----
  const t1 = Date.now();
  const st2 = await Promise.all(
    Array.from({ length: 25 }, () => post("/api/v1/messages/conversations", "student", { recipientId: actors.teacher.id })),
  );
  const c2: Record<number, number> = {};
  for (const s of st2) c2[s] = (c2[s] ?? 0) + 1;
  console.log(`NEW-CONV burst: 25 CONCURRENT requests in ${Date.now() - t1}ms ->`, JSON.stringify(c2));
  console.log(`  (repeat calls to an EXISTING thread are expected to succeed; the bucket is consumed before the gate)`);

  await pool.query(`delete from conversation_messages where body like $1`, [`%${TAG}%`]);
  if (convId) {
    await pool.query(`delete from conversation_messages where conversation_id=$1`, [convId]);
    await pool.query(`delete from conversations where id=$1`, [convId]);
  }
  await pool.query(`delete from conversations where created_at > now() - interval '5 minutes'`);
  console.log("cleaned. conversations now:", JSON.stringify((await pool.query(`select count(*)::int c from conversations`)).rows));
  await pool.end();
}
main();
