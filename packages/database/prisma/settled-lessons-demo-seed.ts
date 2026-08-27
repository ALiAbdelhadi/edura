/* eslint-disable no-console */
import { assertNotProduction } from "../scripts/db-guard";
import {
  assertHttpTargetSharesDatabase,
  requireErpBaseUrl,
} from "./http-target-guard";
import { prisma, withPlatformContext } from "../src/index";

let _baseUrl: string | null = null;
const baseUrl = () => (_baseUrl ??= requireErpBaseUrl("settled-lessons-demo-seed"));
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const DRY_RUN = process.argv.includes("--dry-run");

const CENTER_SHORT_ID = "SHOWCASE01";
const OWNER_EMAIL = "showcasedemo-marwan@edura.test";

type Money = { transactions: number; centerWallet: number; teacherWallets: number };

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

async function assertSameDatabase(cookie: string): Promise<void> {
  const owner = await withPlatformContext((tx) =>
    tx.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } }),
  );
  if (!owner) {
    throw new Error(`settled-lessons-demo-seed: ${OWNER_EMAIL} not found — run seed:showcase-demo first`);
  }
  await assertHttpTargetSharesDatabase({
    seedName: "settled-lessons-demo-seed",
    baseUrl: baseUrl(),
    userId: owner.id,
    cookie,
  });
}

async function signIn(): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `sign-in failed (${res.status}). Is the dev server up on ${baseUrl()}, and does ${OWNER_EMAIL} exist? Run the showcase seed first.`,
    );
  }
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("sign-in returned no session cookie");
  await assertSameDatabase(cookie);
  return cookie;
}

async function main() {
  await assertNotProduction("settled-lessons-demo-seed");

  const center = await withPlatformContext((tx) =>
    tx.center.findFirst({ where: { shortId: CENTER_SHORT_ID }, select: { id: true, name: true } }),
  );
  if (!center) {
    throw new Error(`center ${CENTER_SHORT_ID} not found — run \`bun run seed:showcase-demo\` first`);
  }

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
    const res = await fetch(`${baseUrl()}/api/v1/sessions/${s.id}/complete`, {
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
