/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// SETTLED LESSONS demo — makes the money screens show money.
//
// The showcase center already has 35 completed lessons and 274 present
// attendance records, and ZERO transactions: the showcase seed sets
// `sessions.status = 'completed'` directly, which marks a lesson finished
// without ever running the settlement. So the center's revenue reads 75.00
// ج.م, the teacher wallet is empty, and /dashboard/admin/reports renders its
// empty state — none of which is a fair picture of the product.
//
// THIS SCRIPT WRITES NO MONEY OF ITS OWN. It POSTs each undistributed lesson
// to the app's own `POST /api/v1/sessions/:id/complete`, which is the route a
// center owner presses, and lets `completeSession` → `distributeSessionRevenue`
// do the work: the ONE derivation of what a lesson is worth
// (`resolveLessonPrice`), the same split expression the confirm dialog quotes,
// the H2 conditional decrement, and the `distributed_at` exactly-once claim.
// That is the binding NO SECOND MONEY ENGINE invariant, honoured by not having
// a second engine here at all — there is not one INSERT into transactions,
// wallets or payments in this file.
//
// It therefore REQUIRES THE DEV SERVER TO BE RUNNING. That is a deliberate
// trade: a seed that talked to the tables directly would be exactly the second
// money engine the invariant forbids.
//
// ── PURGE ─────────────────────────────────────────────────────────────────
// There is no `--purge`, and that is not an oversight. The ledger is
// append-only by DB grant (`edura_app` has no UPDATE or DELETE on
// `transactions`), so nothing here can unwrite itself. The removal path is the
// same one every other demo row uses: `bun run db:wipe dev --yes`, which is
// label-guarded to dev/test and refuses production. Do not run this against a
// database whose settlements you would not want to keep.
//
// Usage:
//   bun run --cwd apps/erp dev                 # in another terminal, :3002
//   bun --env-file=.env prisma/settled-lessons-demo-seed.ts
//   bun --env-file=.env prisma/settled-lessons-demo-seed.ts --dry-run
// ---------------------------------------------------------------------------
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";

const BASE_URL = process.env.ERP_BASE_URL ?? "http://localhost:3002";
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * The showcase center and its owner. Pinned by short id rather than by "the
 * first center that comes back", because this database also holds 30-odd
 * machine-generated fixture centers and settling one of those would be money
 * written somewhere nobody is looking.
 */
const CENTER_SHORT_ID = "SHOWCASE01";
const OWNER_EMAIL = "showcasedemo-marwan@edura.test";

type Money = { transactions: number; centerWallet: number; teacherWallets: number };

/**
 * Every read here runs inside `withPlatformContext`. The bare client is
 * RLS-scoped and returns NOTHING without one — which first showed up as this
 * script reporting "center SHOWCASE01 not found" about a center that plainly
 * exists.
 */
async function census(centerId: string): Promise<Money> {
  return withPlatformContext(async (tx) => {
    const [txns, center, teachers] = await Promise.all([
      tx.transaction.count({ where: { centerId } }),
      tx.center.findUnique({ where: { id: centerId }, select: { walletBalance: true } }),
      tx.$queryRaw<{ total: bigint | null }[]>`
        SELECT SUM(tp.wallet_balance)::bigint AS total
        FROM teacher_profiles tp
        WHERE tp.user_id IN (
          SELECT DISTINCT c.teacher_id FROM courses c WHERE c.center_id = ${centerId}::uuid
        )`,
    ]);
    return {
      transactions: txns,
      centerWallet: center?.walletBalance ?? 0,
      teacherWallets: Number(teachers[0]?.total ?? 0),
    };
  });
}

const egp = (piastres: number) => `${(piastres / 100).toFixed(2)} ج.م`;

async function signIn(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `sign-in failed (${res.status}). Is the dev server up on ${BASE_URL}, and does ${OWNER_EMAIL} exist? Run the showcase seed first.`,
    );
  }
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("sign-in returned no session cookie");
  return cookie;
}

async function main() {
  await assertNotProduction();

  const center = await withPlatformContext((tx) =>
    tx.center.findFirst({ where: { shortId: CENTER_SHORT_ID }, select: { id: true, name: true } }),
  );
  if (!center) {
    throw new Error(`center ${CENTER_SHORT_ID} not found — run \`bun run seed:showcase-demo\` first`);
  }

  // Completed, never distributed, and with someone actually present: the
  // engine refuses a lesson with no present students, so sending those would
  // be 35 requests and a misleading "nothing happened".
  const candidates = await withPlatformContext((tx) =>
    tx.session.findMany({
      where: {
        status: "completed",
        distributedAt: null,
        course: { centerId: center.id },
        attendance: { some: { status: "present" } },
      },
      select: { id: true, date: true, course: { select: { title: true } } },
      orderBy: { date: "asc" },
    }),
  );

  console.log(`Center:   ${center.name} (${CENTER_SHORT_ID})`);
  console.log(`Lessons:  ${candidates.length} completed, undistributed, with attendance\n`);

  if (candidates.length === 0) {
    console.log("Nothing to settle. Already done, or the showcase seed has not run.");
    return;
  }

  const before = await census(center.id);
  console.log(
    `Before:   ${before.transactions} transactions · center wallet ${egp(before.centerWallet)} · teacher wallets ${egp(before.teacherWallets)}\n`,
  );

  if (DRY_RUN) {
    for (const s of candidates) {
      console.log(`  would settle  ${s.date.toISOString().slice(0, 10)}  ${s.course.title}`);
    }
    console.log(`\n--dry-run: nothing was sent.`);
    return;
  }

  const cookie = await signIn();
  let settled = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const s of candidates) {
    const day = s.date.toISOString().slice(0, 10);
    const res = await fetch(`${BASE_URL}/api/v1/sessions/${s.id}/complete`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { distribution?: { distributed?: boolean; reason?: string; perSessionPrice?: number } };
      error?: { message?: string };
    };

    if (!res.ok) {
      failures.push(`${day} ${s.course.title}: ${res.status} ${body.error?.message ?? ""}`.trim());
      continue;
    }
    const d = body.data?.distribution;
    if (d?.distributed) {
      settled++;
      console.log(`  settled   ${day}  ${s.course.title}  @ ${egp(d.perSessionPrice ?? 0)}/student`);
    } else {
      skipped++;
      console.log(`  skipped   ${day}  ${s.course.title}  (${d?.reason ?? "no reason given"})`);
    }
  }

  const after = await census(center.id);
  console.log(`\nSettled:  ${settled}   Skipped: ${skipped}   Failed: ${failures.length}`);
  for (const f of failures) console.log(`  FAILED  ${f}`);
  console.log(
    `\nAfter:    ${after.transactions} transactions · center wallet ${egp(after.centerWallet)} · teacher wallets ${egp(after.teacherWallets)}`,
  );
  console.log(
    `Delta:    +${after.transactions - before.transactions} transactions · +${egp(after.centerWallet - before.centerWallet)} center · +${egp(after.teacherWallets - before.teacherWallets)} teachers`,
  );

  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
