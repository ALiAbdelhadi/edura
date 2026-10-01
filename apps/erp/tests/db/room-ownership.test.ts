import { withTenant, withPlatformContext } from "@repo/database";
import { ForbiddenError } from "@repo/server-core/errors/classes";
import { requireCenterScope } from "@repo/server-core/authz/center-scope";
import { uploadRoomPhoto } from "@repo/server-core/services/rooms/rooms";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "room-ownership.test.ts";

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
async function expectThrows(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} (did not throw)`);
  } catch (e) {
    assert(true, `${label} (threw: ${(e as Error).message.slice(0, 80)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function main() {
  const tag = "roomown-" + rid();
  __sweepTag = tag;
  console.log("Room ownership DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkCenter = async (k: string) => {
      const c = await tx.center.create({
        data: { name: `${tag}-${k}`, shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
      });
      const admin = await tx.user.create({
        data: { name: `${tag}-${k}-admin`, role: "center_admin", email: `${tag}-${k}@x.io`, status: "active" },
      });
      await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: c.id } });
      const room = await tx.room.create({ data: { centerId: c.id, name: `${k}-hall`, isActive: true } });
      return { centerId: c.id, adminId: admin.id, roomId: room.id };
    };
    return { A: await mkCenter("A"), B: await mkCenter("B") };
  });

  const userA: SessionUser = { id: fx.A.adminId, role: "center_admin", centerId: fx.A.centerId } as SessionUser;

  expectThrowsSync(() => requireCenterScope(userA, fx.B.centerId), ForbiddenError, "requireCenterScope BLOCKS another center's id");
  let ownOk = true;
  try {
    requireCenterScope(userA, fx.A.centerId);
  } catch {
    ownOk = false;
  }
  assert(ownOk, "requireCenterScope ALLOWS the caller's own center id");

  const file = new File([new Uint8Array(PNG)], "x.png", { type: "image/png" });
  await expectThrows(
    () => uploadRoomPhoto(fx.B.roomId, file, userA),
    "center A cannot upload a photo to center B's room",
  );

  const managed = await withTenant(fx.A.centerId, async (tx) => {
    const updated = await tx.room.update({
      where: { id: fx.A.roomId },
      data: { facilities: ["ac", "projector"], photos: ["https://x/p1.jpg"], price: 50000 },
    });
    const foreign = await tx.room.findUnique({ where: { id: fx.B.roomId } });
    return { updated, foreignVisible: foreign !== null };
  });
  assert(
    managed.updated.facilities.join(",") === "ac,projector" && managed.updated.price === 50000,
    "center A set features + price on its OWN room",
  );
  assert(!managed.foreignVisible, "center B's room is INVISIBLE under center A's tenant scope (RLS)");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

function expectThrowsSync(fn: () => void, ErrClass: new (...a: never[]) => Error, label: string) {
  try {
    fn();
    assert(false, `${label} (did not throw)`);
  } catch (e) {
    assert(e instanceof ErrClass, `${label} (${(e as Error).constructor.name})`);
  }
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
