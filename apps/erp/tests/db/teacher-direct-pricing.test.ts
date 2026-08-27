import { withPlatformContext } from "@repo/database";
import { updateTeacherDirectPricing } from "@repo/server-core/services/center/courses";
import { BusinessRuleError, NotFoundError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "teacher-direct-pricing.test.ts";

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
const su = (id: string): SessionUser => ({ id, role: "teacher" }) as SessionUser;

async function expectError(fn: () => Promise<unknown>, kind: "notfound" | "rule"): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return kind === "notfound" ? e instanceof NotFoundError : e instanceof BusinessRuleError;
  }
}

async function main() {
  const tag = "tdp-" + rid();
  __sweepTag = tag;
  console.log("Teacher-direct pricing DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "teacher", email: `${tag}-o@x.io`, status: "active" },
    });
    const rival = await tx.user.create({
      data: { name: `${tag}-rival`, role: "teacher", email: `${tag}-r@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18) },
    });
    const base = {
      subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
      startDate: new Date("2026-01-01T00:00:00Z"), maxStudents: 30, status: "active" as const,
    };
    const direct = await tx.course.create({
      data: { ...base, centerId: null, teacherId: owner.id, title: `${tag}-direct`, price: 30000,
        pricePerMonth: null, pricePerSession: null },
    });
    const centered = await tx.course.create({
      data: { ...base, centerId: center.id, teacherId: owner.id, title: `${tag}-centered`, price: 30000 },
    });
    return { owner: owner.id, rival: rival.id, direct: direct.id, centered: centered.id };
  });

  console.log("\n[1] the owner prices their own unpriced group");
  const priced = await updateTeacherDirectPricing(su(fx.owner), fx.direct, { pricePerMonth: 25000 });
  assert(priced.pricePerMonth === 25000, "pricePerMonth is set — the stuck state is now self-serviceable");

  console.log("\n[2] re-price, enable the second plan, clear one");
  const both = await updateTeacherDirectPricing(su(fx.owner), fx.direct, { pricePerMonth: 30000, pricePerSession: 4000 });
  assert(both.pricePerMonth === 30000 && both.pricePerSession === 4000, "both plans priced in one patch");
  const cleared = await updateTeacherDirectPricing(su(fx.owner), fx.direct, { pricePerSession: null });
  assert(cleared.pricePerSession === null && cleared.pricePerMonth === 30000, "null clears one plan, the other stands");

  console.log("\n[3] settlementBasis — the same owner-pricing family");
  const basis = await updateTeacherDirectPricing(su(fx.owner), fx.direct, { settlementBasis: "subscription" });
  assert(basis.settlementBasis === "subscription", "settlementBasis is editable by the owner");

  console.log("\n[4] reach");
  assert(
    await expectError(() => updateTeacherDirectPricing(su(fx.rival), fx.direct, { price: 1 }), "notfound"),
    "a rival teacher's probe → NotFound (never Forbidden)",
  );
  assert(
    await expectError(() => updateTeacherDirectPricing(su(fx.owner), fx.centered, { price: 1 }), "notfound"),
    "a CENTERED course 404s even for the teacher who teaches it — the center door owns its pricing",
  );

  console.log("\n[5] an empty patch is refused");
  assert(
    await expectError(() => updateTeacherDirectPricing(su(fx.owner), fx.direct, {}), "rule"),
    "empty body → BusinessRuleError, not a silent no-op",
  );

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
