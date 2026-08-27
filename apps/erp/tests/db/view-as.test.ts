import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  mintViewAsToken,
  verifyViewAsToken,
  isViewAsExpired,
  VIEW_AS_SESSION_TTL_SECONDS,
} from "@repo/server-core/auth/view-as-token";
import { __resetRateLimiterForTests } from "@/lib/rate-limit/token-bucket";
import { rawSessionFor, signInDoor, sessionFor, viewAsDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const PW = "Passw0rd!VA";
const tag = "vatest-" + Math.floor(Math.random() * 1e9).toString(36);

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
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`);
}
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

const ids: string[] = [];
async function mkUser(role: string, status = "active", suffix = role) {
  const email = `${tag}-${suffix}@x.io`;
  const hash = await bcrypt.hash(PW, 10);
  const row = (
    await admin.query(
      `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
       VALUES ($1, $2::role, $3, $4::user_status, $5, true, now()) RETURNING id`,
      [email, role, `${tag} ${suffix}`, status, hash],
    )
  ).rows[0];
  ids.push(row.id);
  return { id: row.id as string, email, role };
}

function tokenFor(actorId: string, target: { id: string; role: string }) {
  return mintViewAsToken({
    targetUserId: target.id,
    actorUserId: actorId,
    targetRole: target.role as never,
  }).token;
}

async function main() {
  console.log("View-as door —", tag);
  __resetRateLimiterForTests();

  const root = await mkUser("super_admin", "active", "root");
  const teacher = await mkUser("teacher", "active", "teacher");
  const student = await mkUser("student", "active", "student");
  const owner = await mkUser("center_admin", "active", "owner");
  const suspended = await mkUser("teacher", "suspended", "susp");
  const accountant = await mkUser("accountant", "active", "acct");
  const demoted = await mkUser("super_admin", "active", "demoted");

  const centerId = crypto.randomUUID();
  await admin.query(
    `INSERT INTO centers (id, name, short_id, status, is_demo, created_at, updated_at)
     VALUES ($1, $2, $3, 'active'::center_status, true, now(), now())`,
    [centerId, `${tag} center`, centerId.slice(0, 8).toUpperCase()],
  );
  const center = { id: centerId };
  await admin.query(
    `INSERT INTO center_admin_profiles (user_id, center_id, updated_at)
     VALUES ($1::uuid, $2::uuid, now())`,
    [owner.id, center.id],
  );

  try {
    section("1. The token itself — signature, tamper, expiry");

    const good = tokenFor(root.id, teacher);
    const payload = verifyViewAsToken(good);
    assert(payload?.sub === teacher.id, "a freshly minted token verifies and names the target");
    assert(payload?.act === root.id, "…and names the actor behind it");

    assert(verifyViewAsToken("") === null, "an empty token verifies to null");
    assert(verifyViewAsToken("garbage") === null, "a shapeless token verifies to null");
    assert(
      verifyViewAsToken(`${good.split(".")[0]}.AAAA`) === null,
      "a token with a replaced signature verifies to null",
    );

    const [body, sig] = good.split(".") as [string, string];
    const decoded = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    decoded.sub = owner.id;
    const forgedBody = Buffer.from(JSON.stringify(decoded))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    assert(
      verifyViewAsToken(`${forgedBody}.${sig}`) === null,
      "re-pointing the token at another user invalidates the signature",
    );

    const realSecret = process.env.VIEW_AS_SECRET;
    process.env.VIEW_AS_SECRET = realSecret ?? "edura-development-view-as-secret";
    const stale = mintViewAsToken({
      targetUserId: teacher.id,
      actorUserId: root.id,
      targetRole: "teacher",
    });
    const staleBody = Buffer.from(
      JSON.stringify({ ...verifyViewAsToken(stale.token)!, exp: Math.floor(Date.now() / 1000) - 5 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const { createHmac } = await import("node:crypto");
    const staleSig = createHmac("sha256", process.env.VIEW_AS_SECRET!)
      .update(staleBody)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    assert(
      verifyViewAsToken(`${staleBody}.${staleSig}`) === null,
      "a correctly-signed but expired token verifies to null",
    );

    section("2. The claim door — who it refuses");

    assert(!(await viewAsDoor("garbage")).ok, "the door refuses a shapeless token");
    assert(
      !(await viewAsDoor(`${forgedBody}.${sig}`)).ok,
      "the door refuses a tampered token",
    );
    assert(
      !(await viewAsDoor(`${staleBody}.${staleSig}`)).ok,
      "the door refuses an expired token",
    );

    assert(
      !(await viewAsDoor(tokenFor(teacher.id, student))).ok,
      "a token minted with a TEACHER as the actor opens nothing",
    );
    assert(
      !(await viewAsDoor(tokenFor(accountant.id, student))).ok,
      "a token minted with an ACCOUNTANT as the actor opens nothing",
    );

    const demotedToken = tokenFor(demoted.id, student);
    await admin.query(`UPDATE users SET role='teacher'::role WHERE id=$1::uuid`, [demoted.id]);
    assert(
      !(await viewAsDoor(demotedToken)).ok,
      "a super admin DEMOTED between mint and claim cannot spend their token",
    );

    const suspendedActorToken = tokenFor(root.id, student);
    await admin.query(`UPDATE users SET status='suspended'::user_status WHERE id=$1::uuid`, [
      root.id,
    ]);
    assert(
      !(await viewAsDoor(suspendedActorToken)).ok,
      "a super admin SUSPENDED between mint and claim cannot spend their token",
    );
    await admin.query(`UPDATE users SET status='active'::user_status WHERE id=$1::uuid`, [root.id]);

    assert(
      !(await viewAsDoor(tokenFor(root.id, accountant))).ok,
      "a BACK-OFFICE target is refused — that case is the in-app impersonation",
    );
    assert(
      !(await viewAsDoor(tokenFor(root.id, suspended))).ok,
      "a SUSPENDED target is refused",
    );

    const deleted = await mkUser("student", "active", "deleted");
    await admin.query(`UPDATE users SET deleted_at = now() WHERE id=$1::uuid`, [deleted.id]);
    assert(
      !(await viewAsDoor(tokenFor(root.id, deleted))).ok,
      "a SOFT-DELETED target is refused",
    );

    section("3. A successful claim — a real ERP session, stamped");

    const claim = await viewAsDoor(tokenFor(root.id, teacher));
    assert(claim.ok, "a live super admin claiming an active teacher succeeds");
    if (!claim.ok) throw new Error("claim failed — the rest of section 3 cannot run");

    const live = await sessionFor(claim.cookie);
    assert(live?.userId === teacher.id, "the resulting session IS the teacher");
    assert(live?.role === "teacher", "…carrying the teacher's own role, not the admin's");

    const raw = await rawSessionFor(claim.cookie);
    assert(
      raw?.impersonatedBy === root.id,
      "getSession() RETURNS impersonatedBy — the field is declared, not just stored",
    );
    assert(!!raw?.createdAt, "…and createdAt, which the one-hour cap is measured from");

    const rows = await q(
      `SELECT impersonated_by, created_at FROM auth_sessions
        WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [teacher.id],
    );
    assert(
      rows[0]?.impersonated_by === root.id,
      "the session row is stamped with the super admin's id",
    );
    const sessionRow = {
      impersonatedBy: rows[0].impersonated_by as string,
      createdAt: rows[0].created_at as Date,
    };
    assert(!isViewAsExpired(sessionRow), "a fresh view-as session is inside the window");
    assert(
      isViewAsExpired({
        ...sessionRow,
        createdAt: new Date(Date.now() - (VIEW_AS_SESSION_TTL_SECONDS + 60) * 1000),
      }),
      "the same session an hour later is outside it — the reader treats it as signed out",
    );
    assert(
      !isViewAsExpired({ impersonatedBy: null, createdAt: new Date(0) }),
      "an ORDINARY session is never capped by this rule, however old",
    );

    const auditRow = await q(
      `SELECT actor_id, action, target_id FROM audit_logs
        WHERE action = 'user.view_as_claimed' AND target_id = $1::uuid`,
      [teacher.id],
    );
    assert(auditRow.length === 1, "the claim wrote exactly one audit row");
    assert(
      auditRow[0]?.actor_id === root.id,
      "…attributed to the SUPER ADMIN, not to the teacher whose session it is",
    );

    const ownerClaim = await viewAsDoor(tokenFor(root.id, owner));
    assert(ownerClaim.ok, "a centre owner can be viewed as");
    if (ownerClaim.ok) {
      const ownerSession = await sessionFor(ownerClaim.cookie);
      assert(
        ownerSession?.centerId === center.id,
        "the session carries the owner's centerId — the enrichment hook ran",
      );
    }

    section("4. Single use");

    const once = tokenFor(root.id, student);
    assert((await viewAsDoor(once)).ok, "a fresh token is spent once");
    assert(!(await viewAsDoor(once)).ok, "…and refused the second time");

    section("5. C-04 is untouched — this is a SECOND door, not a hole");

    const typedIn = await signInDoor(root.email, PW);
    assert(
      !typedIn.ok,
      "a super_admin STILL cannot sign in to this app with their password",
    );
    const teacherStillWorks = await signInDoor(teacher.email, PW);
    assert(teacherStillWorks.ok, "an ordinary ERP password login is unaffected");
  } finally {
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM centers WHERE name = $1`, [`${tag} center`]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite view-as.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
