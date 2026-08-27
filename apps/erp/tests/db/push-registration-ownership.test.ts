import { withPlatformContext } from "@repo/database";
import {
  registerDeviceToken,
  registerPushSubscription,
} from "@/lib/services/notifications/push-registration";
import type { SessionUser } from "@/lib/auth/session";
import type { Role } from "@repo/database";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "push-registration-ownership.test.ts";

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

const su = (id: string): SessionUser => ({ id, role: "student" }) as SessionUser;

const register = (userId: string, token: string, platform: "ios" | "android" | "web") =>
  registerDeviceToken(su(userId), { token, platform });

async function main() {
  const tag = "pushown-" + rid();
  __sweepTag = tag;
  console.log("Push registration ownership DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = async (k: string, role: Role) =>
      tx.user.create({
        data: { name: `${tag}-${k}`, role, email: `${tag}-${k}@x.io`, status: "active" },
      });
    return { victim: await mkUser("victim", "student"), attacker: await mkUser("attacker", "teacher") };
  });

  const TOKEN = `${tag}-device-token`;

  console.log("\n[1] the owner registers, and re-registering is a refresh (not a duplicate)");
  const first = await register(fx.victim.id, TOKEN, "web");
  assert(first === "registered", "first registration creates the row");
  const rowAfterFirst = await withPlatformContext((tx) =>
    tx.userDeviceToken.findUnique({ where: { token: TOKEN }, select: { userId: true, id: true, createdAt: true } }),
  );
  assert(rowAfterFirst?.userId === fx.victim.id, "the row belongs to the registering user");

  const again = await register(fx.victim.id, TOKEN, "android");
  assert(again === "refreshed", "the SAME user re-registering takes the scoped-update path");
  const rowAfterRefresh = await withPlatformContext((tx) =>
    tx.userDeviceToken.findUnique({ where: { token: TOKEN }, select: { id: true, platform: true } }),
  );
  assert(
    rowAfterRefresh?.id === rowAfterFirst?.id && rowAfterRefresh?.platform === "android",
    "a refresh updates the SAME row in place (no churn, id preserved)",
  );
  const countAfterRefresh = await withPlatformContext((tx) =>
    tx.userDeviceToken.count({ where: { token: TOKEN } }),
  );
  assert(countAfterRefresh === 1, `exactly one row per token (got ${countAfterRefresh})`);

  console.log("\n[2] another account claiming the token is an explicit RE-REGISTRATION");
  const taken = await register(fx.attacker.id, TOKEN, "ios");
  assert(taken === "registered", "a different user does NOT take the scoped-update path");
  const rowAfterTakeover = await withPlatformContext((tx) =>
    tx.userDeviceToken.findUnique({ where: { token: TOKEN }, select: { userId: true, id: true } }),
  );
  assert(
    rowAfterTakeover?.userId === fx.attacker.id,
    "the transfer is allowed (a shared device genuinely changes hands)",
  );
  assert(
    rowAfterTakeover?.id !== rowAfterFirst?.id,
    "…but it is a NEW row — the previous owner's registration was revoked, not repointed",
  );
  const victimRows = await withPlatformContext((tx) =>
    tx.userDeviceToken.count({ where: { userId: fx.victim.id } }),
  );
  assert(victimRows === 0, `the previous owner keeps no stale registration (got ${victimRows})`);

  console.log("\n[3] the DELETE routes' ownership scope still holds");
  const foreignDelete = await withPlatformContext((tx) =>
    tx.userDeviceToken.deleteMany({ where: { token: TOKEN, userId: fx.victim.id } }),
  );
  assert(
    foreignDelete.count === 0,
    "a user cannot delete a token owned by someone else (deleteMany scoped by userId matches 0)",
  );
  const stillThere = await withPlatformContext((tx) =>
    tx.userDeviceToken.count({ where: { token: TOKEN } }),
  );
  assert(stillThere === 1, "…and the real owner's registration survives that attempt");

  const ownDelete = await withPlatformContext((tx) =>
    tx.userDeviceToken.deleteMany({ where: { token: TOKEN, userId: fx.attacker.id } }),
  );
  assert(ownDelete.count === 1, "the real owner CAN delete their own registration");

  console.log("\n[4] the web-push channel obeys the SAME rule (shared service)");
  const ENDPOINT = `https://push.example.com/${tag}`;
  await registerPushSubscription(su(fx.victim.id), {
    endpoint: ENDPOINT,
    p256dh: "victim-p256dh",
    auth: "victim-auth",
  });
  const subFirst = await withPlatformContext((tx) =>
    tx.webPushSubscription.findUnique({ where: { endpoint: ENDPOINT }, select: { id: true, userId: true } }),
  );
  assert(subFirst?.userId === fx.victim.id, "subscription belongs to the subscribing user");

  const subTaken = await registerPushSubscription(su(fx.attacker.id), {
    endpoint: ENDPOINT,
    p256dh: "attacker-p256dh",
    auth: "attacker-auth",
  });
  const subAfter = await withPlatformContext((tx) =>
    tx.webPushSubscription.findUnique({
      where: { endpoint: ENDPOINT },
      select: { id: true, userId: true, p256dh: true },
    }),
  );
  assert(subTaken === "registered", "another account claiming the endpoint re-registers rather than repointing");
  assert(
    subAfter?.id !== subFirst?.id && subAfter?.userId === fx.attacker.id,
    "…the previous subscription row is gone, replaced by a new one",
  );
  assert(
    (await withPlatformContext((tx) => tx.webPushSubscription.count({ where: { userId: fx.victim.id } }))) === 0,
    "the previous owner keeps no stale subscription (no silently-repointed keys)",
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
