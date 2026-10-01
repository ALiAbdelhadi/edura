import { testPool } from "../../../../packages/database/scripts/test-pool";
import { randomUUID } from "node:crypto";
import { withPlatformContext, type TenantTx } from "@repo/database";
import { generatePayouts } from "@repo/server-core/backoffice/finance/payouts";
import type { SessionUser } from "@repo/server-core/backoffice-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const TAG = "c02-" + randomUUID().slice(0, 8);
const DEMO_TEACHERS = 30;
const DEMO_CENTERS = 30;
const CHUNK_SIZE = 25;
const BOMB_CONSTRAINT = "c02_partial_failure_probe";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m));
};
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await admin.query(sql, params)).rows as T[];
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (attempt >= 2 || !/Connection terminated|socket hang up|ECONNRESET/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

type PayoutRow = {
  beneficiaryType: string;
  beneficiaryId: string;
  netPayable: number;
  grossAmount: number;
  commission: number;
  lessonCount: number;
};

async function legacyOpenPayoutSum(tx: TenantTx, beneficiaryId: string): Promise<number> {
  const agg = await tx.payout.aggregate({
    where: { beneficiaryId, status: { in: ["pending", "approved"] } },
    _sum: { netPayable: true },
  });
  return agg._sum.netPayable ?? 0;
}

async function legacyLedgerStats(tx: TenantTx, beneficiaryId: string) {
  const comm = await tx.transaction.aggregate({
    where: { fromEntityId: beneficiaryId, type: "commission" },
    _sum: { amount: true },
  });
  const lessons = await tx.transaction.findMany({
    where: { fromEntityId: beneficiaryId, type: "commission" },
    select: { lessonId: true },
    distinct: ["lessonId"],
  });
  return { commission: comm._sum.amount ?? 0, lessonCount: lessons.length };
}

async function legacyGeneratePayouts(tx: TenantTx): Promise<PayoutRow[]> {
  const created: PayoutRow[] = [];

  const teachers = await tx.teacherProfile.findMany({
    where: { walletBalance: { gt: 0 } },
    select: { userId: true, walletBalance: true },
  });
  for (const t of teachers) {
    const locked = await tx.$queryRaw<{ wallet_balance: number }[]>`
      SELECT wallet_balance FROM teacher_profiles WHERE user_id = ${t.userId}::uuid FOR UPDATE`;
    const walletBalance = locked[0]?.wallet_balance ?? t.walletBalance;
    const avail = walletBalance - (await legacyOpenPayoutSum(tx, t.userId));
    if (avail <= 0) continue;
    const stats = await legacyLedgerStats(tx, t.userId);
    await tx.payout.create({
      data: {
        beneficiaryId: t.userId,
        beneficiaryType: "teacher",
        netPayable: avail,
        grossAmount: avail + stats.commission,
        commission: stats.commission,
        lessonCount: stats.lessonCount,
        status: "pending",
      },
    });
    created.push({
      beneficiaryType: "teacher",
      beneficiaryId: t.userId,
      netPayable: avail,
      grossAmount: avail + stats.commission,
      commission: stats.commission,
      lessonCount: stats.lessonCount,
    });
  }

  const centers = await tx.center.findMany({
    where: { walletBalance: { gt: 0 } },
    select: { id: true, walletBalance: true },
  });
  for (const c of centers) {
    const locked = await tx.$queryRaw<{ wallet_balance: number }[]>`
      SELECT wallet_balance FROM centers WHERE id = ${c.id}::uuid FOR UPDATE`;
    const walletBalance = locked[0]?.wallet_balance ?? c.walletBalance;
    const avail = walletBalance - (await legacyOpenPayoutSum(tx, c.id));
    if (avail <= 0) continue;
    const stats = await legacyLedgerStats(tx, c.id);
    await tx.payout.create({
      data: {
        centerId: c.id,
        beneficiaryId: c.id,
        beneficiaryType: "center",
        netPayable: avail,
        grossAmount: avail + stats.commission,
        commission: stats.commission,
        lessonCount: stats.lessonCount,
        status: "pending",
      },
    });
    created.push({
      beneficiaryType: "center",
      beneficiaryId: c.id,
      netPayable: avail,
      grossAmount: avail + stats.commission,
      commission: stats.commission,
      lessonCount: stats.lessonCount,
    });
  }

  return created;
}

class Rollback extends Error {}

async function legacyRolledBack(timeout: number): Promise<{ rows: PayoutRow[]; err: unknown; ms: number }> {
  let rows: PayoutRow[] = [];
  let err: unknown = null;
  const t0 = Date.now();
  try {
    await withPlatformContext(
      async (tx) => {
        rows = await legacyGeneratePayouts(tx);
        throw new Rollback("rollback");
      },
      { timeout, maxWait: 20_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) err = e;
  }
  return { rows, err, ms: Date.now() - t0 };
}

type Snapshot = { users: number; teachers: number; centers: number; payouts: number; txns: number };

async function snapshot(): Promise<Snapshot> {
  const r = await q<{ users: string; teachers: string; centers: string; payouts: string; txns: string }>(
    `SELECT (SELECT COUNT(*) FROM users WHERE name LIKE $1) users,
            (SELECT COUNT(*) FROM teacher_profiles tp JOIN users u ON u.id = tp.user_id
              WHERE u.name LIKE $1) teachers,
            (SELECT COUNT(*) FROM centers WHERE name LIKE $1) centers,
            (SELECT COUNT(*) FROM payouts) payouts,
            (SELECT COUNT(*) FROM transactions WHERE ref_number LIKE $2) txns`,
    [`${TAG}%`, `TXN-${TAG.toUpperCase()}-%`],
  );
  const s = r[0];
  return {
    users: Number(s.users), teachers: Number(s.teachers), centers: Number(s.centers),
    payouts: Number(s.payouts), txns: Number(s.txns),
  };
}

async function seed(): Promise<{ teacherIds: string[]; centerIds: string[]; actorId: string }> {
  const actorId = (
    await q<{ id: string }>(
      `INSERT INTO users (email, role, name, status, is_demo, updated_at)
       VALUES ($1 || '-acct@demo.invalid', 'accountant', $1 || ' accountant', 'active', true, now())
       RETURNING id`,
      [TAG],
    )
  )[0].id;
  const idx = Array.from({ length: Math.max(DEMO_TEACHERS, DEMO_CENTERS) }, (_, i) => i);

  const teacherIds = (
    await q<{ id: string }>(
      `INSERT INTO users (email, role, name, status, is_demo, updated_at)
       SELECT $2 || '-t' || i || '@demo.invalid', 'teacher', $2 || ' teacher ' || i, 'active', true, now()
         FROM unnest($1::int[]) AS t(i)
       RETURNING id`,
      [idx.slice(0, DEMO_TEACHERS), TAG],
    )
  ).map((r) => r.id);
  await q(
    `INSERT INTO teacher_profiles (user_id, subjects, wallet_balance, updated_at)
     SELECT id, '{}', 5000 + (ord * 137)::int, now()
       FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ord)`,
    [teacherIds],
  );

  const centerIds = (
    await q<{ id: string }>(
      `INSERT INTO centers (name, short_id, subjects, status, wallet_balance, is_demo, updated_at)
       SELECT $2 || ' center ' || i, upper($2) || 'C' || i, '{}', 'active', 7000 + (i * 211)::int, true, now()
         FROM unnest($1::int[]) AS t(i)
       RETURNING id`,
      [idx.slice(0, DEMO_CENTERS), TAG],
    )
  ).map((r) => r.id);

  const l1 = randomUUID(), l2 = randomUUID(), l3 = randomUUID();
  const commissions: [string, string | null, number][] = [
    [teacherIds[0], l1, 400], [teacherIds[0], l1, 350], [teacherIds[0], l2, 275],
    [teacherIds[1], null, 500], [teacherIds[1], null, 125],
    [teacherIds[2], l3, 600], [teacherIds[2], null, 90],
    [teacherIds[3], l1, 1_000],
    [centerIds[0], l2, 800], [centerIds[0], l2, 200], [centerIds[0], null, 50],
  ];
  await q(
    `INSERT INTO transactions (ref_number, type, amount, from_entity_id, lesson_id, status)
     SELECT upper($4) || '-' || ord, 'commission', amt, ent, les, 'completed'
       FROM unnest($1::uuid[], $2::uuid[], $3::int[]) WITH ORDINALITY AS t(ent, les, amt, ord)`,
    [
      commissions.map((c) => c[0]),
      commissions.map((c) => c[1]),
      commissions.map((c) => c[2]),
      `TXN-${TAG}`,
    ],
  );

  return { teacherIds, centerIds, actorId };
}

async function cleanup(since: Date) {
  await q(`ALTER TABLE payouts DROP CONSTRAINT IF EXISTS ${BOMB_CONSTRAINT}`);
  await q(`DELETE FROM payouts WHERE created_at >= $1`, [since]);
  await q(`DELETE FROM transactions WHERE ref_number LIKE $1`, [`TXN-${TAG.toUpperCase()}-%`]);
  await q(`DELETE FROM teacher_profiles WHERE user_id IN (SELECT id FROM users WHERE name LIKE $1)`, [`${TAG}%`]);
  await q(`DELETE FROM centers WHERE name LIKE $1`, [`${TAG}%`]);
  await q(`DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE name LIKE $1)`, [`${TAG}%`]);
  await q(`DELETE FROM users WHERE name LIKE $1`, [`${TAG}%`]);
}

const key = (r: { beneficiaryType: string; beneficiaryId: string }) => `${r.beneficiaryType}:${r.beneficiaryId}`;

type Beneficiary = { id: string; kind: string; bal: number; reserved: number };
async function beneficiaryAvailability(): Promise<Beneficiary[]> {
  const rows = await q<{ id: string; kind: string; bal: number; reserved: number }>(
    `SELECT b.id, b.kind, b.bal::int AS bal, COALESCE(p.reserved, 0)::int AS reserved
       FROM (SELECT user_id AS id, 'teacher' AS kind, wallet_balance AS bal
               FROM teacher_profiles WHERE wallet_balance > 0
             UNION ALL
             SELECT id, 'center', wallet_balance FROM centers WHERE wallet_balance > 0) b
       LEFT JOIN (SELECT beneficiary_id, SUM(net_payable) AS reserved FROM payouts
                   WHERE status IN ('pending','approved') GROUP BY beneficiary_id) p
         ON p.beneficiary_id = b.id
      ORDER BY b.kind, b.id`,
  );
  return rows.map((r) => ({ ...r, bal: Number(r.bal), reserved: Number(r.reserved) }));
}
const payable = (rows: Beneficiary[]) => rows.filter((r) => r.bal - r.reserved > 0).length;

async function openPayoutsByBeneficiary() {
  return q<{ beneficiary_id: string; n: string; total: string }>(
    `SELECT beneficiary_id, COUNT(*) n, COALESCE(SUM(net_payable),0) total
       FROM payouts WHERE status IN ('pending','approved') GROUP BY beneficiary_id`,
  );
}

async function payoutRowsFor(ids: string[]) {
  return q<{ beneficiary_id: string; beneficiary_type: string; net_payable: number; gross_amount: number; commission: number; lesson_count: number }>(
    `SELECT beneficiary_id, beneficiary_type, net_payable, gross_amount, commission, lesson_count
       FROM payouts WHERE beneficiary_id = ANY($1::uuid[])`,
    [ids],
  );
}

async function main() {
  const testStart = new Date(Date.now() - 1_000);
  const before = await snapshot();
  console.log("C-02 payout generation — scale + money-parity proof");
  console.log("  tag:", TAG);
  console.log("  DB before:", before);
  if (before.payouts !== 0) {
    console.log(`  note: ${before.payouts} pre-existing payout row(s) — they are never touched or deleted.`);
  }

  try {
    const { teacherIds, centerIds, actorId } = await seed();
    const ACTOR = { id: actorId, role: "accountant" } as SessionUser;
    const scale = await q<{ t: string; c: string }>(
      `SELECT (SELECT COUNT(*) FROM teacher_profiles WHERE wallet_balance > 0) t,
              (SELECT COUNT(*) FROM centers WHERE wallet_balance > 0) c`,
    );
    const nTeachers = Number(scale[0].t), nCenters = Number(scale[0].c);
    const nBeneficiaries = nTeachers + nCenters;
    console.log(`  seeded ${DEMO_TEACHERS} demo teachers + ${DEMO_CENTERS} demo centers (is_demo)`);
    console.log(`  → live beneficiary count for this run: ${nTeachers} teachers + ${nCenters} centers = ${nBeneficiaries}`);

    console.log(`\n(1) C-02 reproduced — pre-fix implementation at the production 20 s ceiling:`);
    const repro = await legacyRolledBack(20_000);
    const reproMsg = repro.err instanceof Error ? repro.err.message.replace(/\s+/g, " ") : "none";
    const expired = /cannot be executed on an expired transaction/.test(reproMsg);
    ok(
      repro.err !== null && expired,
      `pre-fix run FAILED after ${repro.ms} ms: "…${(reproMsg.match(/Transaction API error.{0,150}/) ?? [reproMsg.slice(0, 150)])[0]}"`,
    );

    console.log(`\n(2) MATH UNCHANGED — pre-fix vs fixed, same DB state, per beneficiary:`);
    const legacy = await legacyRolledBack(600_000);
    ok(legacy.err === null, `pre-fix replay completed in ${legacy.ms} ms with a 600 s ceiling (rolled back — wrote nothing)`);
    const legacyPayouts = await q<{ n: string }>(`SELECT COUNT(*) n FROM payouts`);
    ok(Number(legacyPayouts[0].n) === before.payouts, "pre-fix replay left ZERO rows behind (transaction rolled back)");

    const expectedGenerated = payable(await beneficiaryAvailability());
    const t0 = Date.now();
    const fixed = await generatePayouts(ACTOR);
    const fixedMs = Date.now() - t0;

    const genAudit = await q<{ actor_id: string; after_state: { count: number; totalNetPayable: number } }>(
      `SELECT actor_id, after_state FROM audit_logs
        WHERE action = 'payout.generated' AND actor_id = $1`,
      [actorId],
    );
    const auditedCount = genAudit.reduce((n, r) => n + Number(r.after_state.count), 0);
    ok(
      genAudit.length > 0 && auditedCount === fixed.generated,
      `generation audited to the actor: ${genAudit.length} chunk row(s) totalling ${auditedCount} payouts (run generated ${fixed.generated})`,
    );

    const legacyMap = new Map(legacy.rows.map((r) => [key(r), r]));
    const fixedKeys = new Set(fixed.payouts.map(key));
    ok(
      legacy.rows.length === fixed.generated &&
        legacy.rows.every((r) => fixedKeys.has(key(r))),
      `same beneficiary set: pre-fix ${legacy.rows.length} vs fixed ${fixed.generated}`,
    );

    const persisted = await payoutRowsFor([...teacherIds, ...centerIds, ...legacy.rows.map((r) => r.beneficiaryId)]);
    let mismatches = 0;
    let compared = 0;
    for (const row of persisted) {
      const exp = legacyMap.get(`${row.beneficiary_type}:${row.beneficiary_id}`);
      if (!exp) { mismatches++; continue; }
      compared++;
      if (
        row.net_payable !== exp.netPayable ||
        row.gross_amount !== exp.grossAmount ||
        row.commission !== exp.commission ||
        row.lesson_count !== exp.lessonCount
      ) {
        mismatches++;
        console.error(
          `    ✗ ${row.beneficiary_type} ${row.beneficiary_id}: ` +
            `got net=${row.net_payable} gross=${row.gross_amount} comm=${row.commission} lessons=${row.lesson_count} | ` +
            `expected net=${exp.netPayable} gross=${exp.grossAmount} comm=${exp.commission} lessons=${exp.lessonCount}`,
        );
      }
    }
    ok(compared === legacy.rows.length && mismatches === 0,
      `netPayable + grossAmount + commission + lessonCount identical for all ${compared} beneficiaries`);

    const nullCases = persisted.filter((r) => r.beneficiary_id === teacherIds[1] || r.beneficiary_id === teacherIds[2] || r.beneficiary_id === centerIds[0]);
    const expectLessons: Record<string, number> = { [teacherIds[1]]: 1, [teacherIds[2]]: 2, [centerIds[0]]: 2 };
    ok(
      nullCases.length === 3 && nullCases.every((r) => r.lesson_count === expectLessons[r.beneficiary_id]),
      `NULL-lessonId distinct semantics preserved: ` +
        nullCases.map((r) => `${r.lesson_count}`).join("/") + " (expected 1/2/2)",
    );

    console.log(`\n(3) SCALE + TIMING:`);
    console.log(`    pre-fix : ${legacy.ms} ms for ${nBeneficiaries} beneficiaries (FAILS at the real 20 000 ms ceiling)`);
    console.log(`    fixed   : ${fixedMs} ms for ${nBeneficiaries} beneficiaries, ${fixed.generated} payouts generated`);
    ok(fixed.generated === expectedGenerated,
      `all ${expectedGenerated} payable beneficiaries generated in one call (of ${nBeneficiaries} with a positive wallet)`);
    ok(fixedMs < 20_000, `completed in ${fixedMs} ms — under the 20 000 ms interactive-transaction ceiling`);

    console.log(`\n(4) EXACTLY-ONCE — re-running generation:`);
    const rerun = await generatePayouts(ACTOR);
    ok(rerun.generated === 0, `second run generated 0 payouts (was ${fixed.generated})`);
    const afterRerun = await q<{ n: string }>(`SELECT COUNT(*) n FROM payouts`);
    ok(Number(afterRerun[0].n) === before.payouts + fixed.generated, "no duplicate rows written");
    const dupes = await q<{ beneficiary_id: string }>(
      `SELECT beneficiary_id FROM payouts WHERE status IN ('pending','approved')
        GROUP BY beneficiary_id HAVING COUNT(*) > 1`,
    );
    ok(dupes.length === 0, "no beneficiary holds two open payouts");
    const overdraw = await q<{ beneficiary_id: string }>(
      `SELECT p.beneficiary_id FROM (
         SELECT beneficiary_id, SUM(net_payable) reserved FROM payouts
          WHERE status IN ('pending','approved') GROUP BY beneficiary_id) p
       LEFT JOIN teacher_profiles tp ON tp.user_id = p.beneficiary_id
       LEFT JOIN centers c ON c.id = p.beneficiary_id
       WHERE p.reserved > COALESCE(tp.wallet_balance, c.wallet_balance, 0)`,
    );
    ok(overdraw.length === 0, "no wallet is over-reserved (reserved <= balance for every beneficiary)");

    console.log(`\n(5) H1 NOT WEAKENED:`);
    await q(`DELETE FROM payouts WHERE created_at >= $1`, [testStart]);

    const victim = teacherIds[0];
    const victimBal = Number((await q<{ wallet_balance: number }>(
      `SELECT wallet_balance FROM teacher_profiles WHERE user_id=$1`, [victim]))[0].wallet_balance);
    const holder = await admin.connect();
    await holder.query("BEGIN");
    await holder.query(`SELECT wallet_balance FROM teacher_profiles WHERE user_id=$1 FOR UPDATE`, [victim]);
    const genStart = Date.now();
    const genPromise = generatePayouts(ACTOR);
    await new Promise((r) => setTimeout(r, 2_000));
    const midFlight = await q<{ n: string }>(
      `SELECT COUNT(*) n FROM payouts WHERE beneficiary_id=$1`, [victim]);
    ok(Number(midFlight[0].n) === 0, "generation did NOT slip past the held row lock (still 0 payouts for the locked beneficiary)");
    await holder.query(
      `INSERT INTO payouts (beneficiary_id, beneficiary_type, net_payable, gross_amount, commission, lesson_count, status)
       VALUES ($1,'teacher',$2,$2,0,0,'pending')`,
      [victim, victimBal],
    );
    await holder.query("COMMIT");
    holder.release();
    const raced = await genPromise;
    const genMs = Date.now() - genStart;
    const victimRows = await q<{ n: string; total: string }>(
      `SELECT COUNT(*) n, COALESCE(SUM(net_payable),0) total FROM payouts
        WHERE beneficiary_id=$1 AND status IN ('pending','approved')`, [victim]);
    ok(genMs >= 2_000, `generation waited ${genMs} ms for the lock (FOR UPDATE still serialises both paths)`);
    ok(Number(victimRows[0].n) === 1 && Number(victimRows[0].total) === victimBal,
      `locked beneficiary has exactly 1 payout reserving ${victimBal} of ${victimBal} — the self-service request won, generation skipped it`);
    ok(raced.payouts.every((p) => p.beneficiaryId !== victim), "generation did not create a competing payout for that beneficiary");

    await q(`DELETE FROM payouts WHERE created_at >= $1`, [testStart]);
    const [gA, gB] = await Promise.all([generatePayouts(ACTOR), generatePayouts(ACTOR)]);
    const conc = await openPayoutsByBeneficiary();
    const concDupes = conc.filter((r) => Number(r.n) > 1);
    ok(concDupes.length === 0, `two concurrent generators produced no duplicate: ${gA.generated} + ${gB.generated} payouts, 0 beneficiaries with >1`);
    const concOver = await q<{ beneficiary_id: string }>(
      `SELECT p.beneficiary_id FROM (
         SELECT beneficiary_id, SUM(net_payable) reserved FROM payouts
          WHERE status IN ('pending','approved') GROUP BY beneficiary_id) p
       LEFT JOIN teacher_profiles tp ON tp.user_id = p.beneficiary_id
       LEFT JOIN centers c ON c.id = p.beneficiary_id
       WHERE p.reserved > COALESCE(tp.wallet_balance, c.wallet_balance, 0)`,
    );
    ok(concOver.length === 0, "no wallet over-reserved under concurrent generation");

    console.log(`\n(6) PARTIAL FAILURE IS SAFE:`);
    await q(`DELETE FROM payouts WHERE created_at >= $1`, [testStart]);
    const avail = await beneficiaryAvailability();
    const sortedTeachers = avail.filter((b) => b.kind === "teacher").sort((a, b) => (a.id < b.id ? -1 : 1));
    const demoSet = new Set(teacherIds);
    let bombIdx = -1;
    for (let i = sortedTeachers.length - 1; i >= 0; i--) {
      if (demoSet.has(sortedTeachers[i].id)) { bombIdx = i; break; }
    }
    const bomb = sortedTeachers[bombIdx].id;
    const bombChunk = Math.floor(bombIdx / CHUNK_SIZE);
    const expectedCommitted = payable(sortedTeachers.slice(0, bombChunk * CHUNK_SIZE));
    console.log(`    bomb = teacher #${bombIdx} of ${sortedTeachers.length} (chunk ${bombChunk})`);

    await q(
      `ALTER TABLE payouts ADD CONSTRAINT ${BOMB_CONSTRAINT}
         CHECK (beneficiary_id <> '${bomb}'::uuid) NOT VALID`,
    );
    let failMsg = "";
    try {
      await generatePayouts(ACTOR);
    } catch (e) {
      failMsg = (e as Error).message;
    } finally {
      await q(`ALTER TABLE payouts DROP CONSTRAINT IF EXISTS ${BOMB_CONSTRAINT}`);
    }
    ok(failMsg.includes("re-running generation is safe"),
      `generation failed with a resumable error: "${failMsg.slice(0, 130)}…"`);

    const afterFail = await q<{ n: string }>(`SELECT COUNT(*) n FROM payouts WHERE beneficiary_id=$1`, [bomb]);
    ok(Number(afterFail[0].n) === 0, "the failing beneficiary got NO row");
    const halfPaid = await q<{ id: string }>(
      `SELECT id FROM payouts WHERE created_at >= $1
        AND (net_payable IS NULL OR gross_amount IS NULL OR commission IS NULL OR lesson_count IS NULL
             OR gross_amount <> net_payable + commission)`, [testStart]);
    ok(halfPaid.length === 0, "every payout written before the failure is complete and internally consistent (gross = net + commission)");
    const generatedBeforeFail = Number((await q<{ n: string }>(
      `SELECT COUNT(*) n FROM payouts WHERE created_at >= $1`, [testStart]))[0].n);
    console.log(`    ${generatedBeforeFail} of ${nBeneficiaries} beneficiaries were committed before the failure`);
    ok(generatedBeforeFail === expectedCommitted,
      `exactly the ${expectedCommitted} beneficiaries of the fully-committed chunks are present — ` +
        `the failing chunk (and everything after it) wrote NOTHING`);
    ok(generatedBeforeFail > 0 && generatedBeforeFail < expectedGenerated, "the run really did stop midway (a genuine partial batch)");

    const resumed = await generatePayouts(ACTOR);
    ok(resumed.generated === expectedGenerated - generatedBeforeFail,
      `re-run generated exactly the ${expectedGenerated - generatedBeforeFail} missing beneficiaries (${resumed.generated})`);
    const finalRows = await openPayoutsByBeneficiary();
    const finalFromThisTest = await q<{ beneficiary_id: string }>(
      `SELECT beneficiary_id FROM payouts WHERE created_at >= $1
        GROUP BY beneficiary_id HAVING COUNT(*) > 1`, [testStart]);
    ok(finalRows.length === nBeneficiaries && finalFromThisTest.length === 0,
      `final state = all ${finalRows.length} beneficiaries reserved, none twice — identical to a clean single run`);
    const finalOver = await q<{ beneficiary_id: string }>(
      `SELECT p.beneficiary_id FROM (
         SELECT beneficiary_id, SUM(net_payable) reserved FROM payouts
          WHERE status IN ('pending','approved') GROUP BY beneficiary_id) p
       LEFT JOIN teacher_profiles tp ON tp.user_id = p.beneficiary_id
       LEFT JOIN centers c ON c.id = p.beneficiary_id
       WHERE p.reserved <> COALESCE(tp.wallet_balance, c.wallet_balance, 0)`,
    );
    ok(finalOver.length === 0, "every beneficiary reserves exactly its wallet balance — no double-pay, no shortfall");
  } finally {
    console.log(`\n(7) CLEANUP:`);
    await cleanup(testStart);
    const after = await snapshot();
    ok(
      after.users === before.users && after.teachers === before.teachers &&
        after.centers === before.centers && after.payouts === before.payouts &&
        after.txns === before.txns,
      `DB restored: ${JSON.stringify(after)} == ${JSON.stringify(before)}`,
    );
    await admin.end();
  }

  console.log(`\n${fail === 0 ? "C-02 PROOF PASS ✔" : "C-02 PROOF FAIL ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite c02-payout-generation.test.ts" })
  .then(() => main()).catch(async (e) => {
  console.error(e);
  process.exit(1);
});
