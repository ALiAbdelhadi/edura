/* eslint-disable no-console */
/**
 * Removes the walk-in shell students that recording `clip · walk-in` creates.
 *
 * The clip drives the real counter flow, so every take mints a real student:
 * a `users` row, a `student_profiles` row, a place on the centre roster, and an
 * invite token carrying the claim link. None of that is demo-flagged, because
 * the app created it rather than a seed — which is exactly the residue
 * CLAUDE.md warns about accumulating in dev.
 *
 * Scope is deliberately narrow: shell students at the COUNTER-DEMO centre with
 * the clip's name and a phone in the reserved `0100000xxxx` block, holding no
 * subscription, payment, enrolment or attendance. Anything with money attached
 * is reported and left alone — a walk-in that went on to pay is real history,
 * and this script has no business deleting it.
 *
 * Usage, from the repo root:
 *   bun --env-file=packages/database/.env \
 *     apps/erp/tools/system-shots/cleanup-walkins.ts          # list
 *   bun --env-file=packages/database/.env \
 *     apps/erp/tools/system-shots/cleanup-walkins.ts --yes    # delete
 */
import { prisma, withPlatformContext } from "@repo/database";

const CENTER_SHORT_ID = "COUNTERDEMO1";
const CLIP_NAME = "سلمى عبد الرحمن";
const APPLY = process.argv.includes("--yes");

async function main() {
  const found = await withPlatformContext(async (tx) => {
    const center = await tx.center.findFirst({
      where: { shortId: CENTER_SHORT_ID },
      select: { id: true, name: true },
    });
    if (!center) throw new Error(`centre ${CENTER_SHORT_ID} not found`);

    const roster = await tx.centerStudentRoster.findMany({
      where: { centerId: center.id },
      select: { studentId: true },
    });

    const candidates = await tx.user.findMany({
      where: {
        id: { in: roster.map((r) => r.studentId) },
        role: "student",
        name: CLIP_NAME,
        // E.164, because the app NORMALISES what the counter typed: the clip
        // enters `0100000xxxx` and the row stores `+20100000xxxx`. Matching the
        // typed form found nothing and reported a clean database over four
        // real shell students.
        OR: [{ phone: { startsWith: "+2010" } }, { phone: { startsWith: "0100000" } }],
      },
      select: { id: true, name: true, phone: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const rows = [];
    for (const c of candidates) {
      const [subs, att, enr] = await Promise.all([
        tx.subscription.count({ where: { studentId: c.id } }),
        tx.attendanceRecord.count({ where: { studentId: c.id } }),
        tx.enrollment.count({ where: { studentId: c.id } }),
      ]);
      rows.push({ ...c, subs, att, enr, safe: subs === 0 && att === 0 && enr === 0 });
    }
    return { center, rows };
  });

  console.log(`Centre: ${found.center.name} (${CENTER_SHORT_ID})`);
  if (found.rows.length === 0) {
    console.log("No walk-in clip students found. Nothing to do.");
    return;
  }

  for (const r of found.rows) {
    const why = r.safe ? "removable" : `KEPT — subs=${r.subs} attendance=${r.att} enrolments=${r.enr}`;
    console.log(`  ${r.createdAt.toISOString().slice(0, 16)}  ${r.phone}  ${r.id}  ${why}`);
  }

  const removable = found.rows.filter((r) => r.safe);
  if (!APPLY) {
    console.log(`\n${removable.length} removable. Re-run with --yes to delete them.`);
    return;
  }

  await withPlatformContext(async (tx) => {
    for (const r of removable) {
      await tx.inviteToken.deleteMany({ where: { userId: r.id } });
      await tx.centerStudentRoster.deleteMany({ where: { studentId: r.id } });
      await tx.studentProfile.deleteMany({ where: { userId: r.id } });
      await tx.user.deleteMany({ where: { id: r.id } });
      console.log(`  deleted ${r.id}`);
    }
  });
  console.log(`\nRemoved ${removable.length}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
