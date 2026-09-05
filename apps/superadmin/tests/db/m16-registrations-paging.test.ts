import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { listRegistrations } from "@/lib/services/admin/platform";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}

// The queue is platform-wide, so this fixture's rows sit alongside whatever else
// the branch holds. Every assertion below is therefore about THIS tag's rows or
// about page-over-page behaviour, never about an absolute total.
const SEEDED = 5;
const LIMIT = 2;

async function main() {
  const tag = "m16rq-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("M-16 listRegistrations paging DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centers: string[] = [];
    const teachers: string[] = [];
    for (let i = 0; i < SEEDED; i++) {
      const c = await tx.center.create({
        data: {
          name: `${tag}-c${i}`,
          shortId: `${tag.slice(0, 10)}${i}`.toUpperCase(),
          status: "pending",
          walletBalance: 0,
          // Distinct, descending-ordered timestamps so page boundaries are exact.
          createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
        },
      });
      centers.push(c.id);
      const t = await tx.user.create({
        data: {
          name: `${tag}-t${i}`,
          role: "teacher",
          email: `${tag}-t${i}@x.io`,
          status: "pending",
          createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
        },
      });
      teachers.push(t.id);
    }
    return { centers, teachers };
  });

  const mine = <T extends { name: string }>(rows: T[]) => rows.filter((r) => r.name.startsWith(tag));

  try {
    // 1. The centers half is bounded at all. Before the fix it had no `take`,
    //    so this returned every pending centre on the platform.
    const p1 = await listRegistrations("pending", { page: "1", limit: String(LIMIT) });
    assert(p1.centers.length <= LIMIT,
      `centers half honours the limit (got ${p1.centers.length}, cap ${LIMIT})`);
    assert(p1.teachers.length <= LIMIT,
      `teachers half honours the limit (got ${p1.teachers.length}, cap ${LIMIT})`);

    // 2. Both halves report a total, so the screen can say what it is showing
    //    instead of silently truncating.
    assert(p1.centersTotal >= SEEDED && p1.teachersTotal >= SEEDED,
      `both halves report their own total (centers ${p1.centersTotal}, teachers ${p1.teachersTotal}, seeded ${SEEDED} each)`);
    assert(p1.page === 1 && p1.limit === LIMIT,
      `the resolved page/limit come back to the caller (page ${p1.page}, limit ${p1.limit})`);

    // 3. Paging actually advances — page 2 is a different slice, not a repeat.
    const p2 = await listRegistrations("pending", { page: "2", limit: String(LIMIT) });
    const overlapC = p1.centers.filter((a) => p2.centers.some((b) => b.id === a.id));
    const overlapT = p1.teachers.filter((a) => p2.teachers.some((b) => b.id === a.id));
    assert(overlapC.length === 0 && overlapT.length === 0,
      `page 2 shares no row with page 1 (centers ${overlapC.length}, teachers ${overlapT.length} overlapping)`);

    // 4. Walking every page reaches all of this fixture's rows and each exactly
    //    once — the property a `take` alone cannot give you.
    const seenC = new Set<string>();
    const seenT = new Set<string>();
    let dupes = 0;
    const pages = Math.ceil(Math.max(p1.centersTotal, p1.teachersTotal) / LIMIT);
    for (let page = 1; page <= pages; page++) {
      const r = await listRegistrations("pending", { page: String(page), limit: String(LIMIT) });
      for (const c of mine(r.centers)) { if (seenC.has(c.id)) dupes++; seenC.add(c.id); }
      for (const t of mine(r.teachers)) { if (seenT.has(t.id)) dupes++; seenT.add(t.id); }
    }
    assert(dupes === 0, `no row is served twice across ${pages} pages (${dupes} duplicates)`);
    assert(seenC.size === SEEDED, `every seeded centre is reachable by paging (${seenC.size}/${SEEDED})`);
    assert(seenT.size === SEEDED, `every seeded teacher is reachable by paging (${seenT.size}/${SEEDED})`);

    // 5. The admins join still hangs off the PAGE, not off an unbounded read.
    const withAdmins = p1.centers.every((c) => Array.isArray(c.admins));
    assert(withAdmins, "each centre on the page still carries its admins array");

    // 6. A junk page/limit is clamped, not obeyed — parsePageLimit's contract.
    const junk = await listRegistrations("pending", { page: "-4", limit: "99999" });
    assert(junk.page === 1 && junk.limit <= 100,
      `junk paging is clamped (page ${junk.page}, limit ${junk.limit})`);

    // 7. The "rejected" tab asks for no teachers at all, and must not pay for a
    //    teacher count it will not show.
    const rejected = await listRegistrations("rejected", { page: "1", limit: String(LIMIT) });
    assert(rejected.teachers.length === 0 && rejected.teachersTotal === 0,
      `the rejected tab returns no teachers and a zero teacher total (${rejected.teachers.length}/${rejected.teachersTotal})`);
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [fx.teachers]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [fx.centers]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite m16-registrations-paging.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
