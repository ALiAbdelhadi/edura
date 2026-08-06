import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;
const did = seedId("edura-payoutdemo:");
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

const egp = (pounds: number) => Math.round(pounds * 100);

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
  fundEgp: number;
};

const ROWS: Row[] = [
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
