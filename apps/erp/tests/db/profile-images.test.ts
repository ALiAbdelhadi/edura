import { testPool } from "../../../../packages/database/scripts/test-pool";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPlatformContext, prisma } from "@repo/database";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { authorizeCenterActor, MANAGER } from "@/lib/authz/center-actor";
import {
  getCenterLogo,
  setCenterLogo,
  removeCenterLogo,
  setTeacherPhoto,
  removeTeacherPhoto,
} from "@/lib/services/media/profile-images";
import {
  deleteImageByUrl,
  imageSlot,
  MAX_IMAGE_BYTES,
  PLATFORM_BODY_LIMIT_BYTES,
} from "@repo/server-core/media/images";
import { deleteResource, publicIdFromUrl } from "@repo/server-core/media/cloudinary";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures", "images");

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
async function expectError(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
  label: string,
) {
  try {
    await fn();
    assert(false, `${label} — expected ${cls.name} but call RESOLVED`);
  } catch (e) {
    assert(
      e instanceof cls,
      `${label} -> ${cls.name}${e instanceof cls ? "" : ` (got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message})`}`,
    );
  }
}

async function expectReason(
  fn: () => Promise<unknown>,
  reason: string,
  label: string,
  meta: Record<string, unknown> = {},
) {
  try {
    await fn();
    assert(false, `${label} — expected a refusal but the call RESOLVED`);
  } catch (e) {
    const details = (e as { details?: Record<string, unknown> })?.details ?? {};
    const metaOk = Object.entries(meta).every(([k, v]) => details[k] === v);
    assert(
      e instanceof BusinessRuleError && details.reason === reason && metaOk,
      `${label} -> reason "${details.reason ?? "(none)"}"${Object.keys(meta).length ? ` + ${JSON.stringify(meta)}` : ""}`,
    );
  }
}

const su = (u: { id: string; role: string; centerId?: string }): SessionUser =>
  ({ id: u.id, role: u.role, centerId: u.centerId, locale: "ar", name: "t", email: null }) as unknown as SessionUser;

function fileOf(name: string, mime: string, rename = name): File {
  return new File([new Uint8Array(readFileSync(path.join(FIXTURES, name)))], rename, { type: mime });
}

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME!;
const CLD_AUTH =
  "Basic " +
  Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString(
    "base64",
  );
async function assetExists(url: string): Promise<boolean> {
  const id = publicIdFromUrl(url);
  if (!id) return false;
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/upload/${encodeURIComponent(id)}`,
    { headers: { Authorization: CLD_AUTH } },
  );
  return res.status === 200;
}
async function assetInfo(url: string): Promise<{ width: number; height: number; version: number }> {
  const id = publicIdFromUrl(url)!;
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/upload/${encodeURIComponent(id)}`,
    { headers: { Authorization: CLD_AUTH } },
  );
  return (await res.json()) as { width: number; height: number; version: number };
}
async function destroy(url: string | null | undefined) {
  if (!url) return;
  const id = publicIdFromUrl(url);
  if (!id) return;
  const { createHash } = await import("node:crypto");
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = process.env.CLOUDINARY_API_SECRET!;
  const sig = createHash("sha1")
    .update(`invalidate=true&public_id=${id}&timestamp=${timestamp}${secret}`)
    .digest("hex");
  const form = new FormData();
  form.append("public_id", id);
  form.append("invalidate", "true");
  form.append("api_key", process.env.CLOUDINARY_API_KEY!);
  form.append("timestamp", String(timestamp));
  form.append("signature", sig);
  await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, {
    method: "POST",
    body: form,
  }).catch(() => {});
}

async function main() {
  if (!process.env.CLOUDINARY_API_SECRET) {
    console.error("CLOUDINARY_* not configured — this suite proves the real upload path.");
    process.exit(1);
  }
  const tag = "pi-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Profile-image DB tests —", tag);
  const strays: (string | null | undefined)[] = [];

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string) =>
      tx.user.create({
        data: { name: `${tag}-${key}`, role: role as never, email: `${tag}-${key}@x.io`, status: "active" },
      });
    const ownerA = await mkUser("ownerA", "center_admin");
    const ownerB = await mkUser("ownerB", "center_admin");
    const mgrA = await mkUser("mgrA", "center_staff");
    const recA = await mkUser("recA", "center_staff");
    const t1 = await mkUser("t1", "teacher");
    const t2 = await mkUser("t2", "teacher");
    const tNoProfile = await mkUser("t0", "teacher");

    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "AAAAAA").slice(0, 12).toUpperCase(), status: "active", ownerUserId: ownerA.id },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "BBBBBB").slice(0, 12).toUpperCase(), status: "active", ownerUserId: ownerB.id },
    });
    await tx.centerAdminProfile.create({ data: { userId: ownerA.id, centerId: centerA.id } });
    await tx.centerAdminProfile.create({ data: { userId: ownerB.id, centerId: centerB.id } });
    await tx.centerStaff.create({ data: { centerId: centerA.id, staffUserId: mgrA.id, role: "manager" } });
    await tx.centerStaff.create({ data: { centerId: centerA.id, staffUserId: recA.id, role: "receptionist" } });
    await tx.teacherProfile.create({ data: { userId: t1.id } });
    await tx.teacherProfile.create({ data: { userId: t2.id } });

    return { ownerA, ownerB, mgrA, recA, t1, t2, tNoProfile, centerA: centerA.id, centerB: centerB.id };
  });

  const U = [fx.ownerA, fx.ownerB, fx.mgrA, fx.recA, fx.t1, fx.t2, fx.tNoProfile].map((u) => u.id);
  const C = [fx.centerA, fx.centerB];

  const T1 = su({ id: fx.t1.id, role: "teacher" });
  const T2 = su({ id: fx.t2.id, role: "teacher" });
  const T0 = su({ id: fx.tNoProfile.id, role: "teacher" });
  const OWNER_A = su({ id: fx.ownerA.id, role: "center_admin", centerId: fx.centerA });
  const OWNER_B = su({ id: fx.ownerB.id, role: "center_admin", centerId: fx.centerB });

  try {
    console.log("\n[1] teacher photo — upload lands on the deterministic slot");
    const p1 = await setTeacherPhoto(fileOf("small.png", "image/png"), T1);
    strays.push(p1.photoUrl);
    assert(!!p1.photoUrl?.startsWith("https://res.cloudinary.com/"), "returns a Cloudinary URL");
    assert(
      publicIdFromUrl(p1.photoUrl!) === `edura/avatars/${fx.t1.id}`,
      `slot is edura/avatars/<userId> (${publicIdFromUrl(p1.photoUrl!)})`,
    );
    assert(await assetExists(p1.photoUrl!), "the asset really exists in Cloudinary");
    const row1 = await admin.query(`SELECT photo_url FROM teacher_profiles WHERE user_id = $1`, [fx.t1.id]);
    assert(row1.rows[0].photo_url === p1.photoUrl, "the row points at exactly that URL");

    console.log("\n[2] replace OVERWRITES in place — no orphan, no self-destruct");
    const before = await assetInfo(p1.photoUrl!);
    const p2 = await setTeacherPhoto(fileOf("big.jpg", "image/jpeg"), T1);
    strays.push(p2.photoUrl);
    assert(
      publicIdFromUrl(p2.photoUrl!) === publicIdFromUrl(p1.photoUrl!),
      "same public_id across a FORMAT change (png -> jpg)",
    );
    const after = await assetInfo(p2.photoUrl!);
    assert(after.version !== before.version, `version bumped (${before.version} -> ${after.version}) so the URL self-busts caches`);
    assert(await assetExists(p2.photoUrl!), "the replacement asset survived the cleanup pass");
    assert(after.width <= 1024 && after.height <= 1024, `store transform capped a 3000x2000 upload (${after.width}x${after.height})`);

    console.log("\n[3] teacher isolation");
    const q2 = await admin.query(`SELECT photo_url FROM teacher_profiles WHERE user_id = $1`, [fx.t2.id]);
    assert(q2.rows[0].photo_url === null, "t1's uploads never touched t2's row");
    const p2b = await setTeacherPhoto(fileOf("small.png", "image/png"), T2);
    strays.push(p2b.photoUrl);
    assert(publicIdFromUrl(p2b.photoUrl!) === `edura/avatars/${fx.t2.id}`, "t2 gets its own slot");
    assert(await assetExists(p2.photoUrl!), "t2's upload did not destroy t1's asset");

    console.log("\n[4] remove nulls the column AND destroys the asset");
    const removedUrl = p2.photoUrl!;
    const r = await removeTeacherPhoto(T1);
    assert(r.photoUrl === null, "service returns null");
    const row2 = await admin.query(`SELECT photo_url FROM teacher_profiles WHERE user_id = $1`, [fx.t1.id]);
    assert(row2.rows[0].photo_url === null, "column is NULL");
    assert(!(await assetExists(removedUrl)), "the Cloudinary asset is gone (Admin API 404)");
    assert(
      (await removeTeacherPhoto(T1)).photoUrl === null,
      "removing again is idempotent, not an error",
    );

    console.log("\n[5] missing profile is a NotFoundError, not a crash");
    await expectError(() => setTeacherPhoto(fileOf("small.png", "image/png"), T0), NotFoundError, "teacher with no profile");
    await expectError(() => removeTeacherPhoto(T0), NotFoundError, "remove with no profile");

    console.log("\n[6] center logo — owner writes, and the slot is per-center");
    const l1 = await setCenterLogo(fileOf("small.webp", "image/webp"), OWNER_A);
    strays.push(l1.logoUrl);
    assert(
      publicIdFromUrl(l1.logoUrl!) === `edura/logos/${fx.centerA}`,
      `slot is edura/logos/<centerId> (${publicIdFromUrl(l1.logoUrl!)})`,
    );
    assert(await assetExists(l1.logoUrl!), "asset exists");
    const cRow = await admin.query(`SELECT logo_url FROM centers WHERE id = $1`, [fx.centerA]);
    assert(cRow.rows[0].logo_url === l1.logoUrl, "centers.logo_url points at it");

    console.log("\n[7] the cleanup pass CANNOT reach outside the center's own slot");
    const victim = await setCenterLogo(fileOf("small.png", "image/png"), OWNER_B);
    strays.push(victim.logoUrl);
    await admin.query(`UPDATE centers SET logo_url = $1 WHERE id = $2`, [victim.logoUrl, fx.centerA]);
    const l2 = await setCenterLogo(fileOf("big.jpg", "image/jpeg"), OWNER_A);
    strays.push(l2.logoUrl);
    assert(await assetExists(victim.logoUrl!), "centerB's asset SURVIVED centerA's upload");
    const bRow = await admin.query(`SELECT logo_url FROM centers WHERE id = $1`, [fx.centerB]);
    assert(
      bRow.rows[0].logo_url === victim.logoUrl && (await assetExists(bRow.rows[0].logo_url)),
      "…and centerB's row still resolves to a live asset",
    );
    assert(await assetExists(l2.logoUrl!), "centerA's own new logo is stored");
    const tPhoto = await setTeacherPhoto(fileOf("small.png", "image/png"), T2);
    strays.push(tPhoto.photoUrl);
    await admin.query(`UPDATE centers SET logo_url = $1 WHERE id = $2`, [tPhoto.photoUrl, fx.centerA]);
    await setCenterLogo(fileOf("small.webp", "image/webp"), OWNER_A);
    assert(await assetExists(tPhoto.photoUrl!), "a teacher's photo survived a center's logo upload");

    console.log("\n[8] sub-role + ownership gates");
    const mgrActor = await authorizeCenterActor(su({ id: fx.mgrA.id, role: "center_staff" }), { allow: MANAGER });
    const l3 = await setCenterLogo(fileOf("small.png", "image/png"), mgrActor.acting);
    strays.push(l3.logoUrl);
    assert(publicIdFromUrl(l3.logoUrl!) === `edura/logos/${fx.centerA}`, "manager writes centerA's slot");
    assert(
      (await getCenterLogo(mgrActor.acting)).logoUrl === l3.logoUrl,
      "manager reads the logo back through the same gate",
    );
    assert(
      (await getCenterLogo(OWNER_A)).logoUrl === l3.logoUrl,
      "…and the owner sees exactly the same value",
    );
    await expectError(
      () => authorizeCenterActor(su({ id: fx.recA.id, role: "center_staff" }), { allow: MANAGER }),
      ForbiddenError,
      "receptionist refused by the route's allow-list",
    );
    const lB = await setCenterLogo(fileOf("small.png", "image/png"), OWNER_B);
    strays.push(lB.logoUrl);
    assert(publicIdFromUrl(lB.logoUrl!) === `edura/logos/${fx.centerB}`, "ownerB writes only centerB's slot");
    assert(await assetExists(l3.logoUrl!), "…and left centerA's logo alone");
    await expectError(
      () => setCenterLogo(fileOf("small.png", "image/png"), su({ id: fx.ownerA.id, role: "center_admin" })),
      ForbiddenError,
      "a center_admin session with NO centerId is refused",
    );

    console.log("\n[9] refusals carry a REASON CODE and reach nothing");
    const liveBefore = (await admin.query(`SELECT logo_url FROM centers WHERE id = $1`, [fx.centerA]))
      .rows[0].logo_url as string;
    await expectReason(
      () => setCenterLogo(fileOf("evil.svg", "image/jpeg", "logo.jpg"), OWNER_A),
      "unsupported_image_type",
      "SVG spoofed as image/jpeg",
    );
    await expectReason(
      () => setCenterLogo(fileOf("fake.jpg", "image/jpeg"), OWNER_A),
      "unsupported_image_type",
      "plain text named .jpg",
    );
    await expectReason(
      () => setTeacherPhoto(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "x.jpg", { type: "image/jpeg" }), T2),
      "image_too_large",
      "one byte over the ceiling",
      { maxMb: 4 },
    );
    await expectReason(
      () => setTeacherPhoto(new File([new Uint8Array(4.4 * 1024 * 1024)], "x.jpg", { type: "image/jpeg" }), T2),
      "image_too_large",
      "4.4 MB — under the old 5 MB ceiling, over the platform body cap",
      { maxMb: 4 },
    );
    assert(
      MAX_IMAGE_BYTES < PLATFORM_BODY_LIMIT_BYTES,
      `the ceiling (${MAX_IMAGE_BYTES}) sits under the platform cap (${PLATFORM_BODY_LIMIT_BYTES})`,
    );
    assert(await assetExists(liveBefore), "a refused upload left the stored logo untouched");
    const cRow2 = await admin.query(`SELECT logo_url FROM centers WHERE id = $1`, [fx.centerA]);
    assert(cRow2.rows[0].logo_url === liveBefore, "and left the row untouched");

    console.log("\n[11] a delete that does nothing is DISTINGUISHABLE from one that works");
    {
      const a = await setTeacherPhoto(fileOf("small.png", "image/png"), T2);
      const id = publicIdFromUrl(a.photoUrl!)!;
      assert((await deleteResource(id, "raw")) === "not_found", "wrong resource_type -> not_found");
      assert(await assetExists(a.photoUrl!), "…and the asset is, correctly, still there");
      assert((await deleteResource(id, "image")) === "deleted", "right resource_type -> deleted");
      assert(!(await assetExists(a.photoUrl!)), "…and it really is gone");
      assert((await deleteResource(id, "image")) === "not_found", "deleting it again -> not_found");

      const other = await setCenterLogo(fileOf("small.png", "image/png"), OWNER_B);
      strays.push(other.logoUrl);
      assert(
        (await deleteImageByUrl(other.logoUrl, { owned: imageSlot("avatar", fx.t2.id) })) ===
          "skipped",
        "an asset outside the owned slot -> skipped",
      );
      assert(await assetExists(other.logoUrl!), "…and it survives");

      const realSecret = process.env.CLOUDINARY_API_SECRET;
      process.env.CLOUDINARY_API_SECRET = "definitely-not-the-secret";
      const outcome = await deleteResource(publicIdFromUrl(other.logoUrl!)!, "image");
      process.env.CLOUDINARY_API_SECRET = realSecret;
      assert(outcome === "failed", `a rejected signature -> failed (got "${outcome}")`);
      assert(await assetExists(other.logoUrl!), "…and nothing was destroyed");
    }

    console.log("\n[10] remove center logo");
    const gone = liveBefore;
    const rm = await removeCenterLogo(OWNER_A);
    assert(rm.logoUrl === null, "service returns null");
    assert(!(await assetExists(gone)), "asset destroyed");
    const cRow3 = await admin.query(`SELECT logo_url FROM centers WHERE id = $1`, [fx.centerA]);
    assert(cRow3.rows[0].logo_url === null, "column is NULL");
  } finally {
    for (const u of strays) await destroy(u);
    await admin.query(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [U]).catch(() => {});
    await admin.query(`UPDATE centers SET owner_user_id = NULL WHERE id = ANY($1::uuid[])`, [C]).catch(() => {});
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite profile-images.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
