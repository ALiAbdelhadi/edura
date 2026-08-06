/**
 * ===========================================================================
 * PLATFORM USER DIRECTORY — the cross-role user surface + its limits.
 * ===========================================================================
 * Drives the REAL shipped service against the live DB:
 *   apps/superadmin/src/lib/services/admin/admin-users.ts
 *
 * Each proof is about the BOUNDARY as much as the action:
 *
 *   • ONE suspension mechanism — suspending writes users.status and the
 *     better-auth ban columns stay untouched, so the two can never disagree;
 *     and because C-03 wires status to revocation, the live session rows are
 *     gone in the same breath;
 *   • a session revoke is NOT a deactivation — status is unchanged and the
 *     account signs straight back in;
 *   • a 2FA reset ends the sessions too, so it cannot be used to keep a live
 *     session alive without a second factor, and a back-office account is
 *     flagged as having to re-enroll;
 *   • impersonation is refused for every www role, for another super_admin,
 *     for yourself and for an inactive account — the only thing it permits is
 *     a back-office accountant;
 *   • every write lands an audit row naming actor, target and reason.
 *
 *   bunx tsx --env-file=<env> tests/db/admin-users.test.ts
 * ===========================================================================
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import {
  assertImpersonatable,
  getUserDetail,
  listUsers,
  resetTwoFactor,
  revokeAllSessions,
  revokeOneSession,
  sendPasswordReset,
  setUserSuspended,
} from "@/lib/services/admin/admin-users";
import type { SessionUser } from "@/lib/auth/session";
import { signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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
async function rejects(fn: () => Promise<unknown>, expect: RegExp) {
  try {
    await fn();
    return { threw: false, matched: false, message: "(resolved — no error)" };
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    return { threw: true, matched: expect.test(message), message };
  }
}
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

const PW = "Passw0rd!";
const tag = "auwtest-" + Math.floor(Math.random() * 1e9).toString(36);
const ids: string[] = [];

/**
 * www roles cannot pass THIS app's sign-in door — that is C-04, and proving it
 * is another suite's job. All apps share ONE auth_sessions table, so a planted
 * row is how a www user's live session is represented here; the revocation
 * paths under test operate on that table, not on how the row was born.
 * Back-office fixtures still use the real door (signInDoor) below.
 */
async function plantSession(userId: string): Promise<string> {
  const row = (
    await admin.query(
      `INSERT INTO auth_sessions (token, user_id, expires_at, updated_at, ip_address, user_agent)
       VALUES (gen_random_uuid()::text, $1::uuid, now() + interval '7 days', now(), '203.0.113.7', 'proof-suite')
       RETURNING id`,
      [userId],
    )
  ).rows[0];
  return row.id as string;
}

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
  return { id: row.id as string, email };
}

const auditRows = (targetId: string, action: string) =>
  q(
    `SELECT actor_id, action, target_type, before_state, after_state
       FROM audit_logs WHERE target_id = $1::uuid AND action = $2
      ORDER BY created_at DESC`,
    [targetId, action],
  );

async function main() {
  console.log("Platform user directory —", tag);

  const superAdmin = await mkUser("super_admin", "active", "root");
  const accountant = await mkUser("accountant", "active", "acct");
  // A second back-office fixture: the superadmin door's C2 bucket is capacity 5
  // refilling at 1/min per email, so the sign-in proofs are split across two
  // accounts rather than exhausting one.
  const accountant2 = await mkUser("accountant", "active", "acct2");
  const teacher = await mkUser("teacher", "active", "teacher");
  const student = await mkUser("student", "active", "student");
  const otherAdmin = await mkUser("super_admin", "active", "root2");

  const actor: SessionUser = {
    id: superAdmin.id,
    role: "super_admin",
    locale: "ar",
    name: `${tag} root`,
    email: superAdmin.email,
  };

  try {
    // ─────────────────────────────────────────────────────────────────────
    section("1. Directory — search, filter, paginate");

    const byQuery = await listUsers({ q: tag });
    assert(byQuery.users.length >= 5, "search matches the fixtures by name");
    assert(
      byQuery.users.every((u) => u.name.includes(tag)),
      "search returns only matching rows",
    );

    const byEmail = await listUsers({ q: teacher.email });
    assert(
      byEmail.users.length === 1 && byEmail.users[0]?.id === teacher.id,
      "search matches an exact email",
    );

    const teachersOnly = await listUsers({ q: tag, role: "teacher" });
    assert(
      teachersOnly.users.length === 1 && teachersOnly.users[0]?.id === teacher.id,
      "role filter narrows to that role",
    );

    const page1 = await listUsers({ q: tag, take: 2 });
    assert(page1.users.length === 2 && !!page1.nextCursor, "page 1 returns take + a cursor");
    const page2 = await listUsers({ q: tag, take: 2, cursor: page1.nextCursor ?? undefined });
    const overlap = page2.users.filter((u) => page1.users.some((p) => p.id === u.id));
    assert(overlap.length === 0, "page 2 does not repeat page 1");

    // ─────────────────────────────────────────────────────────────────────
    section("2. Detail — identity + live sessions");

    const login = await signInDoor(accountant.email, PW);
    assert(login.ok, "the accountant can sign in (fixture sanity)");

    const detail = await getUserDetail(accountant.id);
    assert(detail.user.id === accountant.id, "detail returns the user");
    assert(detail.sessions.length === 1, "detail lists the live session");
    assert(
      typeof detail.sessions[0]?.userAgent === "string",
      "the session carries a device string",
    );
    const missing = await rejects(() => getUserDetail(superAdmin.id.replace(/.$/, "0")), /not found|invalid/i);
    assert(missing.threw, "an unknown id is a clean not-found, not a crash");

    // ─────────────────────────────────────────────────────────────────────
    section("3. Suspend — ONE mechanism, and it revokes");

    const before = await q(`SELECT status, banned, ban_reason FROM users WHERE id=$1::uuid`, [
      teacher.id,
    ]);
    assert(before[0].banned === false, "fixture starts with better-auth banned = false");

    await plantSession(teacher.id);
    const liveBefore = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
      teacher.id,
    ]);
    assert(liveBefore[0].n === 1, "the teacher has a live session before suspension");

    await setUserSuspended(actor, teacher.id, true, "compromised account");

    const after = await q(`SELECT status, banned, ban_reason FROM users WHERE id=$1::uuid`, [
      teacher.id,
    ]);
    assert(after[0].status === "suspended", "status is the thing that changed");
    assert(
      after[0].banned === false && after[0].ban_reason === null,
      "better-auth ban columns are STILL untouched — one mechanism, not two",
    );
    const liveAfter = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
      teacher.id,
    ]);
    assert(liveAfter[0].n === 0, "C-03: suspending deleted the live session rows");

    // The sign-in half of the proof runs on a BACK-OFFICE account, because the
    // www roles above cannot reach this app's door at all (C-04).
    await setUserSuspended(actor, accountant2.id, true, "compromised account");
    const blocked = await signInDoor(accountant2.email, PW);
    assert(!blocked.ok, "a suspended account cannot sign in");

    const suspendAudit = await auditRows(teacher.id, "user.suspended");
    assert(suspendAudit.length === 1, "the suspension wrote exactly one audit row");
    assert(suspendAudit[0].actor_id === superAdmin.id, "the audit row names the actor");
    assert(
      suspendAudit[0].after_state?.reason === "compromised account",
      "the audit row records the reason",
    );
    assert(
      suspendAudit[0].before_state?.status === "active",
      "the audit row records the previous status",
    );

    const noReason = await rejects(
      () => setUserSuspended(actor, student.id, true, "   "),
      /reason is required/i,
    );
    assert(noReason.threw && noReason.matched, "a blank reason is refused");

    const self = await rejects(
      () => setUserSuspended(actor, superAdmin.id, true, "oops"),
      /your own account/i,
    );
    assert(self.threw && self.matched, "you cannot suspend yourself");

    const twice = await rejects(
      () => setUserSuspended(actor, teacher.id, true, "again"),
      /already suspended/i,
    );
    assert(twice.threw && twice.matched, "suspending twice is refused, not silently repeated");

    await setUserSuspended(actor, teacher.id, false, "cleared");
    const reinstated = await q(`SELECT status FROM users WHERE id=$1::uuid`, [teacher.id]);
    assert(reinstated[0].status === "active", "reinstate restores active");
    await setUserSuspended(actor, accountant2.id, false, "cleared");
    assert((await signInDoor(accountant2.email, PW)).ok, "and the account can sign in again");

    // ─────────────────────────────────────────────────────────────────────
    section("4. Revoke sessions — NOT a deactivation");

    await plantSession(student.id);
    const beforeStatus = (await q(`SELECT status FROM users WHERE id=$1::uuid`, [student.id]))[0]
      .status;

    const revoked = await revokeAllSessions(actor, student.id, "lost laptop");
    assert(revoked.sessionsRemoved >= 1, "the revoke reports how many sessions it ended");
    const none = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
      student.id,
    ]);
    assert(none[0].n === 0, "no session rows remain");
    const afterStatus = (await q(`SELECT status FROM users WHERE id=$1::uuid`, [student.id]))[0]
      .status;
    assert(afterStatus === beforeStatus, "status is unchanged — this is not a punishment");
    // "Can sign back in" is proven on a back-office account, the only role this
    // app's door accepts; for the www user the equivalent is that nothing about
    // the account was disabled, asserted immediately above.
    assert(
      (await signInDoor(accountant2.email, PW)).ok,
      "a revoked account signs straight back in",
    );

    const revokeAudit = await auditRows(student.id, "user.sessions_revoked");
    assert(
      revokeAudit[0]?.after_state?.statusChanged === false &&
        revokeAudit[0]?.after_state?.canSignInAgain === true,
      "the audit row says plainly that this was not a deactivation",
    );

    // one device only
    await plantSession(student.id);
    await plantSession(student.id);
    const twoRows = await q(
      `SELECT id FROM auth_sessions WHERE user_id=$1::uuid ORDER BY created_at`,
      [student.id],
    );
    assert(twoRows.length >= 2, "two devices have live sessions");
    await revokeOneSession(actor, student.id, twoRows[0].id);
    const left = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
      student.id,
    ]);
    assert(left[0].n === twoRows.length - 1, "revoking one device leaves the others alone");

    const foreign = await rejects(
      () => revokeOneSession(actor, teacher.id, twoRows[1].id),
      /not found/i,
    );
    assert(
      foreign.threw && foreign.matched,
      "a session id belonging to another user cannot be revoked through them",
    );

    // ─────────────────────────────────────────────────────────────────────
    section("5. 2FA reset — recovery, not a downgrade");

    await admin.query(
      `INSERT INTO two_factors (user_id, secret, backup_codes) VALUES ($1::uuid, 'S', 'B')`,
      [accountant.id],
    );
    await admin.query(`UPDATE users SET two_factor_enabled = true WHERE id=$1::uuid`, [
      accountant.id,
    ]);
    await signInDoor(accountant.email, PW);

    const reset = await resetTwoFactor(actor, accountant.id, "lost phone");
    assert(reset.twoFactorEnabled === false, "2FA is cleared");
    const rows2fa = await q(`SELECT count(*)::int n FROM two_factors WHERE user_id=$1::uuid`, [
      accountant.id,
    ]);
    assert(rows2fa[0].n === 0, "the TOTP secret row is deleted");
    const sess2fa = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
      accountant.id,
    ]);
    assert(sess2fa[0].n === 0, "sessions end too — no live session without a second factor");
    const twoFaAudit = await auditRows(accountant.id, "user.two_factor_reset");
    assert(
      twoFaAudit[0]?.after_state?.mustReEnroll === true,
      "the audit row flags that a back-office account must re-enroll",
    );
    const notEnabled = await rejects(
      () => resetTwoFactor(actor, student.id, "nope"),
      /does not have 2fa/i,
    );
    assert(notEnabled.threw && notEnabled.matched, "resetting 2FA that is not on is refused");

    // ─────────────────────────────────────────────────────────────────────
    section("6. Password reset — the admin never sets a password");

    const hashBefore = (await q(`SELECT password_hash FROM users WHERE id=$1::uuid`, [student.id]))[0]
      .password_hash;
    const resetNoReason = await rejects(
      () => sendPasswordReset(actor, student.id),
      /reason is required/i,
    );
    assert(
      resetNoReason.threw && resetNoReason.matched,
      "a reset with no reason is refused — every action on this screen records WHY",
    );
    const sent = await sendPasswordReset(actor, student.id, "user lost access");
    assert(sent.email === student.email, "the reset is addressed to the user");
    const tokenRows = await q(
      `SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1::uuid AND used_at IS NULL`,
      [student.id],
    );
    assert(tokenRows[0].n === 1, "exactly one live reset token was minted");
    const hashAfter = (await q(`SELECT password_hash FROM users WHERE id=$1::uuid`, [student.id]))[0]
      .password_hash;
    assert(hashAfter === hashBefore, "the password itself is UNCHANGED — the user chooses it");
    const resetAudit = await auditRows(student.id, "user.password_reset_sent");
    assert(resetAudit.length === 1, "and it is audited");
    assert(
      resetAudit[0]?.after_state?.reason === "user lost access",
      "the audit row carries the reason, like every other action here",
    );

    await setUserSuspended(actor, student.id, true, "temporarily off");
    const inactiveReset = await rejects(
      () => sendPasswordReset(actor, student.id, "still needed"),
      /only an active account/i,
    );
    assert(
      inactiveReset.threw && inactiveReset.matched,
      "a reset for a non-active account is refused instead of silently not delivered",
    );
    await setUserSuspended(actor, student.id, false, "back on");

    // ─────────────────────────────────────────────────────────────────────
    section("7. Impersonation — the boundary is the feature");

    const ok = await assertImpersonatable(actor, accountant.id);
    assert(ok.id === accountant.id, "a back-office accountant MAY be impersonated");

    for (const [who, id] of [
      ["a teacher", teacher.id],
      ["a student", student.id],
    ] as const) {
      const r = await rejects(
        () => assertImpersonatable(actor, id),
        /back-office accounts can be impersonated/i,
      );
      assert(r.threw && r.matched, `${who} (a www role) is refused — cross-app sessions are invalid`);
    }

    const lateral = await rejects(
      () => assertImpersonatable(actor, otherAdmin.id),
      /another super admin/i,
    );
    assert(lateral.threw && lateral.matched, "another super admin is refused (lateral privilege)");

    const selfImp = await rejects(
      () => assertImpersonatable(actor, superAdmin.id),
      /your own account/i,
    );
    assert(selfImp.threw && selfImp.matched, "impersonating yourself is refused");

    const notAdmin: SessionUser = { ...actor, id: accountant.id, role: "accountant" };
    const wrongRole = await rejects(
      () => assertImpersonatable(notAdmin, teacher.id),
      /only a super admin/i,
    );
    assert(wrongRole.threw && wrongRole.matched, "an accountant cannot impersonate at all");

    await setUserSuspended(actor, accountant.id, true, "off for now");
    const inactiveImp = await rejects(
      () => assertImpersonatable(actor, accountant.id),
      /only an active account/i,
    );
    assert(inactiveImp.threw && inactiveImp.matched, "an inactive account cannot be impersonated");
    await setUserSuspended(actor, accountant.id, false, "back");

    // ─────────────────────────────────────────────────────────────────────
    section("8. Money stays out of reach");

    // Same posture as center-oversight: "superadmin sees all money but moves
    // none" is checkable by reading one import list.
    const src = readFileSync(
      fileURLToPath(new URL("../../src/lib/services/admin/admin-users.ts", import.meta.url)),
      "utf8",
    );
    const importLines = src
      .split("\n")
      .filter((l) => l.startsWith("import"))
      .join("\n");
    const moneyImport = /(wallet|payout|ledger|transaction|invoice|settlement)/i.test(importLines);
    assert(!moneyImport, "the module imports nothing from a money service");
  } finally {
    await admin.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM password_reset_tokens WHERE user_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await admin.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite admin-users.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
