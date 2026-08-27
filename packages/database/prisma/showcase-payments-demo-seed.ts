/* eslint-disable no-console */
import { assertNotProduction } from "../scripts/db-guard";
import {
  assertHttpTargetSharesDatabase,
  requireErpBaseUrl,
} from "./http-target-guard";
import { prisma, withPlatformContext } from "../src/index";

let _baseUrl: string | null = null;
const baseUrl = () => (_baseUrl ??= requireErpBaseUrl("showcase-payments-demo-seed"));
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const DRY_RUN = process.argv.includes("--dry-run");

const CENTER_SHORT_ID = "SHOWCASE01";
const OWNER_EMAIL = "showcasedemo-marwan@edura.test";

const UNPAID_KEEP = 6;

const egp = (piastres: number) => `${(piastres / 100).toFixed(2)} ج.م`;

async function assertSameDatabase(cookie: string): Promise<void> {
  const owner = await withPlatformContext((tx) =>
    tx.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } }),
  );
  if (!owner) {
    throw new Error(`showcase-payments-demo-seed: ${OWNER_EMAIL} not found — run seed:showcase-demo first`);
  }
  await assertHttpTargetSharesDatabase({
    seedName: "showcase-payments-demo-seed",
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
      `sign-in failed (${res.status}). Dev server up on ${baseUrl()}? Does ${OWNER_EMAIL} exist?`,
    );
  }
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("sign-in returned no session cookie");
  await assertSameDatabase(cookie);
  return cookie;
}

async function census(centerId: string) {
  return withPlatformContext(async (tx) => {
    const [payments, paid, subs] = await Promise.all([
      tx.payment.count({ where: { centerId } }),
      tx.payment.aggregate({ where: { centerId, status: "paid" }, _sum: { amount: true } }),
      tx.subscription.count({ where: { centerId } }),
    ]);
    return { payments, total: paid._sum.amount ?? 0, subs };
  });
}

async function main() {
  await assertNotProduction("showcase-payments-demo-seed");

  const center = await withPlatformContext((tx) =>
    tx.center.findFirst({ where: { shortId: CENTER_SHORT_ID }, select: { id: true, name: true } }),
  );
  if (!center) throw new Error(`center ${CENTER_SHORT_ID} not found — run seed:showcase-demo first`);

  const enrolments = await withPlatformContext(async (tx) => {
    const rows = await tx.enrollment.findMany({
      where: { course: { centerId: center.id } },
      select: {
        studentId: true,
        courseId: true,
        course: { select: { title: true, pricePerMonth: true } },
      },
      orderBy: [{ courseId: "asc" }, { studentId: "asc" }],
    });
    const students = await tx.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(students.map((s) => [s.id, s.name]));

    const existing = await tx.subscription.findMany({
      where: { centerId: center.id, status: "active" },
      select: { studentId: true, courseId: true },
    });
    const taken = new Set(existing.map((s) => `${s.studentId}:${s.courseId}`));
    return rows
      .filter((r) => !taken.has(`${r.studentId}:${r.courseId}`))
      .map((r) => ({ ...r, studentName: nameOf.get(r.studentId) ?? r.studentId }));
  });

  const toPay = enrolments.slice(0, Math.max(0, enrolments.length - UNPAID_KEEP));
  const leftUnpaid = enrolments.length - toPay.length;

  console.log(`Center:      ${center.name} (${CENTER_SHORT_ID})`);
  console.log(`Enrolments:  ${enrolments.length} without an active subscription`);
  console.log(`Paying:      ${toPay.length}   Left unpaid on purpose: ${leftUnpaid}\n`);

  if (toPay.length === 0) {
    console.log("Nothing to do — every enrolment already has an active subscription.");
    return;
  }

  const before = await census(center.id);
  console.log(
    `Before:      ${before.payments} payments · ${egp(before.total)} collected · ${before.subs} subscriptions\n`,
  );

  if (DRY_RUN) {
    for (const e of toPay) {
      console.log(`  would charge  ${e.studentName} — ${e.course.title} @ ${egp(e.course.pricePerMonth ?? 0)}`);
    }
    console.log("\n--dry-run: nothing was sent.");
    return;
  }

  const cookie = await signIn();
  let paid = 0;
  const failures: string[] = [];

  for (const e of toPay) {
    const res = await fetch(`${baseUrl()}/api/v1/center/subscriptions`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ studentId: e.studentId, courseId: e.courseId, plan: "monthly" }),
    });
    if (res.ok) {
      paid++;
      console.log(`  cash  ${e.studentName} — ${e.course.title}  ${egp(e.course.pricePerMonth ?? 0)}`);
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      failures.push(`${e.studentName} / ${e.course.title}: ${res.status} ${body.error?.message ?? ""}`.trim());
    }
  }

  const after = await census(center.id);
  console.log(`\nCharged: ${paid}   Failed: ${failures.length}`);
  for (const f of failures) console.log(`  FAILED  ${f}`);
  console.log(
    `\nAfter:       ${after.payments} payments · ${egp(after.total)} collected · ${after.subs} subscriptions`,
  );
  console.log(`Delta:       +${after.payments - before.payments} payments · +${egp(after.total - before.total)}`);
  console.log(`\n${leftUnpaid} enrolment(s) left unpaid so the arrears counter stays honest.`);

  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
