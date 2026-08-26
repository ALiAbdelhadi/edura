/**
 * B.1#11 — unread counts (API session 2).
 *
 * `getUnreadTotal` existed with zero callers while three portals' bars had no
 * badge; the student dashboard's hardcoded `unreadMessages: 0` was removed
 * rather than faked. `getUnreadCounts` is the real read.
 *
 * What is proven here:
 *   1. Own counts: the denormalized conversation counters summed, plus unread
 *      notification rows (readAt IS NULL — a read one does not count).
 *   2. Parents get per-child counts for MINOR children only — the oversight
 *      population exactly. An ADULT child answers `null`, not 0: "told
 *      nothing" is different from "nothing unread". No reach added.
 *   3. Non-parents get `children: null`.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only unread-counts
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { getUnreadCounts } from "@/lib/services/messages/messages";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "unread-counts.test.ts";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const su = (id: string, role: string): SessionUser => ({ id, role }) as SessionUser;

async function main() {
  const tag = "unrd-" + rid();
  __sweepTag = tag;
  console.log("Unread-counts DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const parent = await tx.user.create({
      data: { name: `${tag}-parent`, role: "parent", email: `${tag}-p@x.io`, status: "active" },
    });
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    // Minor by DEFAULT-MINOR: a profile with no DOB resolves to minor.
    const minor = await tx.user.create({
      data: { name: `${tag}-minor`, role: "student", email: `${tag}-m@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: minor.id, fullName: `${tag}-minor`, phone: `+2010${tag.replace(/\D/g, "").padEnd(8, "3").slice(0, 8)}`,
        familyLinkCode: (tag + "f1").slice(0, 18), entityType: "registered", pointsBalance: 0 },
    });
    // Adult: verified DOB, age ≥ 18 — the one positive adult condition.
    const adult = await tx.user.create({
      data: { name: `${tag}-adult`, role: "student", email: `${tag}-a@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: adult.id, fullName: `${tag}-adult`, phone: `+2010${tag.replace(/\D/g, "").padEnd(8, "4").slice(0, 8)}`,
        familyLinkCode: (tag + "f2").slice(0, 18), entityType: "registered", pointsBalance: 0,
        dateOfBirth: new Date("2000-01-01T00:00:00Z"), dateOfBirthVerifiedAt: new Date() },
    });
    for (const child of [minor.id, adult.id]) {
      await tx.parentStudentLink.create({
        data: { parentId: parent.id, studentId: child, status: "approved", initiatedBy: "parent" },
      });
    }

    // Conversations with denormalized unread counters. Canonical pair order:
    // user_a_id < user_b_id (DB CHECK), so which counter is "theirs" depends
    // on the sort — computed here instead of assumed.
    const mkConv = async (x: string, y: string, unreadFor: string, count: number) => {
      const [a, b] = x < y ? [x, y] : [y, x];
      await tx.conversation.create({
        data: {
          userAId: a, userBId: b,
          aUnreadCount: unreadFor === a ? count : 0,
          bUnreadCount: unreadFor === b ? count : 0,
        },
      });
    };
    await mkConv(parent.id, teacher.id, parent.id, 3); // parent's own unread
    await mkConv(minor.id, teacher.id, minor.id, 2); // the minor's unread
    await mkConv(adult.id, teacher.id, adult.id, 5); // the adult child's — must NOT be served

    // Notifications: two unread + one read for the parent.
    const notif = (readAt: Date | null) =>
      tx.notification.create({
        data: { userId: parent.id, type: "new_chat_message", title: `${tag}-n`, body: "x",
          read: !!readAt, readAt },
      });
    await notif(null);
    await notif(null);
    await notif(new Date());

    return { parent: parent.id, teacher: teacher.id, minor: minor.id, adult: adult.id };
  });

  console.log("\n[1] own counts");
  const parentCounts = await getUnreadCounts(su(fx.parent, "parent"));
  assert(parentCounts.messages === 3, "messages = the caller's own conversation counters summed");
  assert(parentCounts.notifications === 2, "notifications = unread rows only — the read one does not count");

  console.log("\n[2] per-child, oversight population exactly");
  const byChild = new Map((parentCounts.children ?? []).map((c) => [c.studentId, c.unreadMessages]));
  assert(byChild.get(fx.minor) === 2, "a MINOR child's own unread total is served (oversight population)");
  assert(byChild.has(fx.adult) && byChild.get(fx.adult) === null,
    "an ADULT child answers null — told nothing, which is not 'nothing unread'; no reach added");

  console.log("\n[3] non-parents");
  const teacherCounts = await getUnreadCounts(su(fx.teacher, "teacher"));
  assert(teacherCounts.children === null, "a non-parent gets children: null");
  assert(teacherCounts.messages === 0, "…and their own (zero) message count");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
