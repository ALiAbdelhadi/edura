/**
 * T-8 — the sessions payload names its center (API session 2, item B.1#8).
 *
 * `Session` has no center column, so "which building?" reaches a session only
 * through `Course.centerId`. The teacher hero used to re-join that through
 * `me/affiliations` on the client; `enrichSessions` now serves it, so the
 * student, parent and teacher heroes share one shape.
 *
 * Proven: a centered course's session carries its center's id + name; a
 * teacher-direct session carries `centerId: null, centerName: ""` — honest,
 * because its venue is the course's own free-text location, not a center.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only sessions-center-name
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { enrichSessions } from "@/lib/services/sessions/enrich";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "sessions-center-name.test.ts";

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

async function main() {
  const tag = "scn-" + rid();
  __sweepTag = tag;
  console.log("Sessions centerName DB tests —", tag);

  const result = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18) },
    });
    const base = {
      teacherId: teacher.id, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
      startDate: new Date("2026-01-01T00:00:00Z"), maxStudents: 30, status: "active" as const, price: 30000,
    };
    const centered = await tx.course.create({ data: { ...base, centerId: center.id, title: `${tag}-centered` } });
    const direct = await tx.course.create({ data: { ...base, centerId: null, title: `${tag}-direct` } });
    const room = await tx.room.create({
      data: { centerId: center.id, name: `${tag}-hall`, capacity: 20 },
    });
    const when = new Date("2026-08-01T12:00:00Z");
    const mk = (courseId: string, roomId?: string) =>
      tx.session.create({
        data: { courseId, teacherId: teacher.id, roomId: roomId ?? null, originalDate: when, date: when,
          startTime: "10:00", endTime: "11:00", status: "scheduled" },
      });
    const s1 = await mk(centered.id, room.id);
    const s2 = await mk(direct.id);

    const enriched = await enrichSessions(tx, [s1, s2]);
    return { enriched, centerId: center.id, centerName: `${tag}-center`, s1: s1.id, s2: s2.id };
  });

  const byId = new Map(result.enriched.map((s) => [s.id, s]));
  const centered = byId.get(result.s1);
  const direct = byId.get(result.s2);

  assert(centered?.centerId === result.centerId, "a centered session carries its course's centerId");
  assert(centered?.centerName === result.centerName, "…and the center's NAME, served — no client-side affiliations join needed");
  assert(direct?.centerId === null && direct?.centerName === "", "a teacher-direct session answers null/'' — its venue is not a center");
  assert(
    !!centered && centered.courseName.endsWith("centered") && centered.teacherName.includes(tag),
    "the existing joins (courseName, teacherName) are unchanged around the new field",
  );
  // B.1#9 rides on the same function: dashboards/student's todaySchedule now
  // fills `room`/`teacher` from these joins instead of `""` by construction.
  assert(centered?.roomName.endsWith("hall") === true, "roomName joins through the session's room");
  assert(direct?.roomName === "", "a session with no hall answers '' — honest, not fabricated");

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
