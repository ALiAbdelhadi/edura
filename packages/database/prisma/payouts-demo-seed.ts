/* eslint-disable no-console */
/**
 * ============================================================================
 * PAYOUTS DEMO SEED — so اليوم and مستحقات وصرف render populated
 * ============================================================================
 * Seeds withdraw requests against the beneficiaries the center-oversight demo
 * seed already created, so nothing new is invented and every root entity is
 * already `isDemo = true` (payouts inherit demo-ness by ancestry, per the
 * CLAUDE.md rule that only root entities carry the flag).
 *
 * MONEY — read this before adding to it:
 *
 *   The center-oversight seed deliberately writes ZERO money rows, because
 *   oversight only READS money. This seed is the documented exception: the
 *   payouts screen IS the money feature, and seeding it was approved
 *   explicitly. Even so it stays inside the tightest boundary that still
 *   produces a useful screen:
 *
 *   • WRITES ONLY to `payouts` — a withdraw REQUEST, not a settlement.
 *   • Writes NOTHING to transactions, points_ledger, session_settlements,
 *     payments or invoices. Those are append-only and REVOKEd; a seed has no
 *     business in them.
 *   • Seeds NO `paid` payout. A paid row with no ledger entry would be a lie:
 *     it claims money moved while the ledger says nothing happened, which is
 *     precisely the dishonesty the whole system is built to prevent. To see a
 *     paid row, APPROVE one in the UI — that runs the real settlement, writes
 *     the real Transaction, and is also the only honest way to exercise the
 *     two-step commit end to end.
 *   • Touches `wallet_balance` on the four demo beneficiaries ONLY, and the
 *     purge resets them to 0. That is deliberate, not decoration: the panel's
 *     clearance advisory reads the same balance `settlePayout`'s H2
 *     conditional decrement will read, so without a funded wallet every demo
 *     payout would show as blocked and the healthy path would be invisible.
 *     One beneficiary is left UNDERFUNDED on purpose so the «يوقف الصرف»
 *     blocking card and the red clearance line both render.
 *
 * SAFETY (same contract as the other demo seeds):
 *   • assertNotProduction guards both the seed and the purge.
 *   • Deterministic UUIDv5 ids — re-run is an upsert, never a duplicate.
 *   • Beneficiaries are resolved by their natural key (shortId / email), never
 *     by a hardcoded uuid, so this cannot bind to the wrong row.
 *
 *   Seed:  bunx tsx --env-file=.env.local prisma/payouts-demo-seed.ts
 *   Purge: bunx tsx --env-file=.env.local prisma/payouts-demo-seed.ts --purge
 * ============================================================================
 */
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;
const did = seedId("edura-payoutdemo:");
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

/** Egyptian pounds → integer piasters. Money is NEVER a float in this system. */
const egp = (pounds: number) => Math.round(pounds * 100);

/* The oversight demo's own people, by natural key. `أ. شريف الجندي` is the name
   the design brief uses in its worked example of the metric card's row-3 fact
   («أقدم طلب: ٣ أيام — أ. شريف الجندي»), so his request is the oldest here and
   that line renders exactly as specified. */
const TEACHERS = {
  sherif: "أ. شريف الجندي",
  dalia: "أ. داليا مرسي",
  adel: "أ. عادل شكري",
  mona: "أ. منى الشاذلي",
} as const;

const CENTER_HORIZON = "OVSDEMOHRZN";
const CENTER_NILE = "OVSDEMONILE";

type Row = {
  key: string;
  who: { kind: "teacher"; name: string } | { kind: "center"; shortId: string };
  grossEgp: number;
  commissionPct: number;
  lessonCount: number;
  ageDays: number;
  status: "pending" | "rejected";
  rejectionReason?: string;
  /** Wallet funding for the beneficiary, in EGP. Below net ⇒ blocked. */
  fundEgp: number;
};

const ROWS: Row[] = [
  // The spec's worked example: 45,000 gross − 15% = 38,250 net, oldest at 3 days.
  {
    key: "sherif-july",
    who: { kind: "teacher", name: TEACHERS.sherif },
    grossEgp: 45_000,
    commissionPct: 15,
    lessonCount: 1_240,
    ageDays: 3,
    status: "pending",
    fundEgp: 52_000,
  },
  {
    key: "dalia-july",
    who: { kind: "teacher", name: TEACHERS.dalia },
    grossEgp: 28_400,
    commissionPct: 15,
    lessonCount: 780,
    ageDays: 2,
    status: "pending",
    fundEgp: 30_000,
  },
  {
    key: "adel-july",
    who: { kind: "teacher", name: TEACHERS.adel },
    grossEgp: 12_750,
    commissionPct: 15,
    lessonCount: 355,
    ageDays: 1,
    status: "pending",
    fundEgp: 14_000,
  },
  // UNDERFUNDED on purpose — this is the row that makes «يوقف الصرف» appear on
  // اليوم and turns the panel's clearance advisory red.
  {
    key: "horizon-july",
    who: { kind: "center", shortId: CENTER_HORIZON },
    grossEgp: 96_000,
    commissionPct: 15,
    lessonCount: 2_610,
    ageDays: 2,
    status: "pending",
    fundEgp: 50_000,
  },
  // Rejected rows carry their reason — a rejection with none cannot be
  // explained to the beneficiary (D-026), and the badge renders it.
  {
    key: "mona-june",
    who: { kind: "teacher", name: TEACHERS.mona },
    grossEgp: 7_400,
    commissionPct: 15,
    lessonCount: 205,
    ageDays: 26,
    status: "rejected",
    rejectionReason: "طلب مكرر — صُرفت نفس الفترة في دفعة سابقة.",
    fundEgp: 0,
  },
  {
    key: "nile-june",
    who: { kind: "center", shortId: CENTER_NILE },
    grossEgp: 18_000,
    commissionPct: 15,
    lessonCount: 500,
    ageDays: 31,
    status: "rejected",
    rejectionReason: "بيانات الحساب البنكي غير مكتملة — يُعاد الطلب بعد استكمالها.",
    fundEgp: 0,
  },
];

async function main() {
  const env = await assertNotProduction(
    PURGE ? "purge the payouts demo seed" : "seed demo payouts",
  );
  console.log(`\n${PURGE ? "PURGING" : "SEEDING"} payouts demo  (db: ${env})\n`);

  await withPlatformContext(async (tx) => {
    // Resolve every beneficiary by natural key first, so a missing prerequisite
    // fails loudly here rather than writing half a fixture.
    const teacherNames = [...new Set(ROWS.flatMap((r) => (r.who.kind === "teacher" ? [r.who.name] : [])))];
    const centerShortIds = [...new Set(ROWS.flatMap((r) => (r.who.kind === "center" ? [r.who.shortId] : [])))];

    const teachers = await tx.user.findMany({
      where: { role: "teacher", isDemo: true, name: { in: teacherNames } },
      select: { id: true, name: true },
    });
    const centers = await tx.center.findMany({
      where: { shortId: { in: centerShortIds } },
      select: { id: true, name: true, shortId: true },
    });

    const missingT = teacherNames.filter((n) => !teachers.some((t) => t.name === n));
    const missingC = centerShortIds.filter((s) => !centers.some((c) => c.shortId === s));
    if (missingT.length || missingC.length) {
      throw new Error(
        `payouts-demo-seed: missing prerequisites — run center-oversight-demo-seed.ts first.\n` +
          `  teachers: ${missingT.join(", ") || "ok"}\n  centers: ${missingC.join(", ") || "ok"}`,
      );
    }

    const resolve = (w: Row["who"]) =>
      w.kind === "teacher"
        ? { id: teachers.find((t) => t.name === w.name)!.id, label: w.name, centerId: null as string | null }
        : (() => {
            const c = centers.find((x) => x.shortId === w.shortId)!;
            return { id: c.id, label: c.name, centerId: c.id };
          })();

    if (PURGE) {
      const ids = ROWS.map((r) => did(r.key));
      const del = await tx.payout.deleteMany({ where: { id: { in: ids } } });

      // Restore the wallets this seed funded. They were 0 before it ran.
      for (const r of ROWS) {
        const b = resolve(r.who);
        if (r.who.kind === "teacher") {
          await tx.teacherProfile.updateMany({ where: { userId: b.id }, data: { walletBalance: 0 } });
        } else {
          await tx.center.updateMany({ where: { id: b.id }, data: { walletBalance: 0 } });
        }
      }
      console.log(`  removed ${del.count} payout(s); demo wallet balances reset to 0`);
      console.log(`  NOTE: a payout you APPROVED in the UI settled for real — its`);
      console.log(`        Transaction row is append-only and is NOT removed here.`);
      return;
    }

    let pending = 0;
    let rejected = 0;

    for (const r of ROWS) {
      const b = resolve(r.who);
      const gross = egp(r.grossEgp);
      const commission = Math.round((gross * r.commissionPct) / 100);
      const net = gross - commission;
      const createdAt = daysAgo(r.ageDays);

      await tx.payout.upsert({
        where: { id: did(r.key) },
        create: {
          id: did(r.key),
          centerId: b.centerId,
          beneficiaryId: b.id,
          beneficiaryType: r.who.kind,
          periodStart: daysAgo(r.ageDays + 30),
          periodEnd: createdAt,
          lessonCount: r.lessonCount,
          grossAmount: gross,
          commission,
          netPayable: net,
          status: r.status,
          rejectionReason: r.rejectionReason ?? null,
          createdAt,
        },
        update: {
          grossAmount: gross,
          commission,
          netPayable: net,
          lessonCount: r.lessonCount,
          status: r.status,
          rejectionReason: r.rejectionReason ?? null,
          createdAt,
        },
      });

      // Fund the beneficiary so the clearance advisory has something real to
      // read. Demo beneficiaries only — see the money note in the header.
      if (r.who.kind === "teacher") {
        await tx.teacherProfile.updateMany({
          where: { userId: b.id },
          data: { walletBalance: egp(r.fundEgp) },
        });
      } else {
        await tx.center.updateMany({
          where: { id: b.id },
          data: { walletBalance: egp(r.fundEgp) },
        });
      }

      const covered = egp(r.fundEgp) >= net;
      if (r.status === "pending") pending++;
      else rejected++;
      console.log(
        `  ${r.status.padEnd(8)} ${b.label.padEnd(22)} net ${(net / 100).toLocaleString("en-EG")} EGP` +
          (r.status === "pending" ? `  wallet ${covered ? "covers" : "SHORT — blocks disbursement"}` : ""),
      );
    }

    console.log(`\n  ${pending} pending · ${rejected} rejected · 0 paid (see the money note)`);
    console.log(`  0 rows written to transactions / ledger / payments / invoices`);
  });

  if (!PURGE) {
    console.log(
      `\nاليوم        → 4 payout decisions, oldest 3 days (أ. شريف الجندي), 1 blocked\n` +
        `مستحقات وصرف → pills: بانتظار الصرف 4 · مدفوعة 0 · مرفوضة 2\n` +
        `\nTo see a PAID row and the seal: approve one in the UI. That runs the real\n` +
        `settlement and writes a real Transaction — the only honest way to get one.`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
