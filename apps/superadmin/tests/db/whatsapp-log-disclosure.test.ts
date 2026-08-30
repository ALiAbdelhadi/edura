import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma, withPlatformContext } from "@repo/database";
import {
  listWhatsAppMessages,
  getWhatsAppMessage,
} from "@/lib/services/admin/whatsapp-messages";
import { sendWhatsApp } from "@repo/server-core/services/whatsapp/send";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "wal-" + Math.floor(Math.random() * 1e9).toString(36);
const seed = Math.floor(Math.random() * 1e9);
const phone = `+2010${String(seed).padStart(9, "0").slice(0, 6)}77`;
const TOKEN = "tok-" + "x".repeat(30);

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

async function main() {
  console.log("WhatsApp log disclosure (M4) —", tag);

  const student = await withPlatformContext((tx) =>
    tx.user.create({
      data: { name: tag + "-student", phone, role: "student", status: "shell", passwordHash: null, isDemo: true },
    }),
  );

  try {
    console.log("\n[1] a claim link is never stored in the log");
    const link = `https://edura-erp.vercel.app/ar/claim?token=${TOKEN}`;
    await sendWhatsApp({
      to: phone,
      template: "walk_in_welcome",
      params: [tag + "-student", "ABCD1234", link],
      locale: "ar",
      userId: student.id,
    });
    const stored = await q<{ id: string; params: unknown }>(
      `SELECT id, params FROM whatsapp_messages WHERE user_id = $1`, [student.id],
    );
    ok(stored.length === 1, "the send wrote exactly one log row");
    const raw = JSON.stringify(stored[0]?.params ?? null);
    ok(!raw.includes(TOKEN), "the live token is NOT in the stored params");
    ok(raw.includes("token=***"), "…it is stored redacted, so the row proves a link was sent without carrying it");

    console.log("\n[2] the list ships only what the list renders");
    const list = await listWhatsAppMessages({ q: phone });
    const row = list.data.find((r) => r.id === stored[0]!.id) as Record<string, unknown> | undefined;
    ok(row !== undefined, "the message is listed");
    ok("recipientPhone" in (row ?? {}), "the phone the operator reads is present");
    ok(!("params" in (row ?? {})), "params (the child's name and student code) are NOT in the list");
    ok(!("providerResponse" in (row ?? {})), "the provider payload is NOT in the list");
    ok(!("error" in (row ?? {})), "the error blob is NOT in the list");

    console.log("\n[3] opening one row still gives an operator the detail");
    const detail = (await getWhatsAppMessage(stored[0]!.id)) as Record<string, unknown>;
    ok("params" in detail, "the detail read returns params");
    ok("providerResponse" in detail, "…and the provider payload");
    ok(
      !JSON.stringify(detail).includes(TOKEN),
      "…and even there the live token is absent — redaction is at rest, not at render",
    );

    console.log("\n[4] an unknown id is a clean 404, not a crash");
    let msg = "<<no throw>>";
    try {
      await getWhatsAppMessage("00000000-0000-4000-8000-000000000000");
    } catch (e) {
      msg = (e as Error).message;
    }
    ok(/not found/i.test(msg), `an unknown message id is refused (${msg.slice(0, 40)})`);
  } finally {
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM whatsapp_messages WHERE user_id = $1`, [student.id]);
      await c.query(`DELETE FROM users WHERE id = $1`, [student.id]);
      const left = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite whatsapp-log-disclosure.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
