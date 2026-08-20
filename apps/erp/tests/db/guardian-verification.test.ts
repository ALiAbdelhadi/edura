// GUARDIAN EMAIL VERIFICATION proof — the address on file reaches a real adult.
//
// `tests/unit/guardian-verification.test.ts` already proves the pure parts:
// `isGuardianEmailVerified`'s address binding, `maskEmail`, and that the purpose
// is absent from the CLAIMABLE map. What only a live database can prove is the
// thing the feature is FOR, and every one of these is a claim about rows:
//
//   1. THE TOKEN MINTS NO SESSION. The map says so; this drives the real
//      better-auth claim door with a real guardian token and asserts it is
//      REFUSED. A guardian is not a user of this platform, and the invite
//      machinery next door turns a token of the wrong purpose into a LOGIN —
//      so this is the assertion standing between "prove an address" and
//      "anyone holding a child's guardian address receives a session".
//   2. THE RAW TOKEN IS NEVER PERSISTED. Only its SHA-256. A dump of
//      invite_tokens must not be a set of working links.
//   3. SINGLE USE, IN THE SAME TRANSACTION AS THE STAMP. A double click cannot
//      produce two confirmations.
//   4. NO ORACLE. Unknown, expired, used, and mailed-to-a-since-changed-address
//      all return the IDENTICAL message. A prober must not learn which.
//   5. EDITING THE ADDRESS UN-VERIFIES IT, and the link that proved the old
//      inbox stops working — asserted by SCANNING the old token, not by
//      reading the column.
//   6. A RESEND LEAVES ONE LIVE LINK. Two live links for two addresses is how
//      a stale one confirms an address nobody re-checked.
//   7. IT GRANTS NOTHING ELSE. No money, no session row, no status change —
//      counted, not assumed.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { createHash } from "node:crypto";
import {
  confirmGuardianEmail,
  GUARDIAN_VERIFICATION_PURPOSE,
  guardianVerificationStats,
  guardianVerifyLink,
  isGuardianEmailVerified,
  issueGuardianVerification,
  maskEmail,
} from "@repo/server-core/services/invites/guardian-verification";
import { CLAIMABLE } from "@repo/server-core/services/invites/invite-token";
import { claimDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "gver-" + Math.floor(Math.random() * 1e9).toString(36);
const guardianOf = (n: number) => `${tag}-guardian${n}@example.com`;

/** The one message EVERY failure mode must return. */
const GENERIC = "This link is not valid or has expired";

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

/** Returns the rejection message, or a marker when the call unexpectedly won. */
async function refusalMessage(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "<<SUCCEEDED>>";
  } catch (e) {
    return (e as Error).message ?? "";
  }
}

async function profileOf(userId: string) {
  return (
    await q<{
      id: string;
      guardian_email: string | null;
      guardian_email_verified_at: Date | null;
      guardian_email_verified_value: string | null;
    }>(
      `SELECT id, guardian_email, guardian_email_verified_at, guardian_email_verified_value
         FROM student_profiles WHERE user_id = $1`,
      [userId],
    )
  )[0]!;
}

const asProfile = (r: Awaited<ReturnType<typeof profileOf>>) => ({
  guardianEmail: r.guardian_email,
  guardianEmailVerifiedAt: r.guardian_email_verified_at,
  guardianEmailVerifiedValue: r.guardian_email_verified_value,
});

async function main() {
  console.log("Guardian email verification —", tag);

  // Taken BEFORE the fixtures exist: the stats are a whole-database count, so a
  // baseline read afterwards would already include them and every delta would
  // be zero.
  const statsBefore = await guardianVerificationStats();

  const fx = await withPlatformContext(async (tx) => {
    const mk = async (n: number, guardianEmail: string | null) => {
      const user = await tx.user.create({
        data: {
          name: `${tag}-student${n}`, role: "student", email: `${tag}-s${n}@x.io`,
          status: "active", isDemo: true,
        },
      });
      await tx.studentProfile.create({
        data: {
          userId: user.id, fullName: `${tag} طالب ${n}`,
          familyLinkCode: `${tag}-fam${n}`.slice(0, 32),
          ...(guardianEmail ? { guardianEmail } : {}),
        },
      });
      return user.id;
    };
    return {
      // The ordinary case: a minor with a guardian address on file.
      main: await mk(1, guardianOf(1)),
      // The one whose guardian address changes between send and click.
      moved: await mk(2, guardianOf(2)),
      // Verified once, then edited — the un-verification case.
      edited: await mk(3, guardianOf(3)),
      // Expiry.
      expired: await mk(4, guardianOf(4)),
      // Nothing to verify.
      none: await mk(5, null),
    };
  });
  const allUsers = Object.values(fx);

  try {
    // =====================================================================
    console.log("\n[1] Issue — a link, and a row that is not the link");
    // =====================================================================
    const issued = await issueGuardianVerification({ studentUserId: fx.main, actorId: fx.main });
    ok(issued.email === guardianOf(1), "the link is minted for the address ON FILE, not one the caller names");
    ok(issued.token.length >= 32, `the token is opaque and long (${issued.token.length} chars)`);
    ok(issued.expiresAt.getTime() > Date.now(), "…and carries a future expiry");

    const rows = await q<{ id: string; token_hash: string; email: string; purpose: string; used_at: Date | null }>(
      `SELECT id, token_hash, email, purpose, used_at FROM invite_tokens WHERE user_id = $1`,
      [fx.main],
    );
    ok(rows.length === 1, "exactly one token row exists for the student");
    ok(rows[0]!.purpose === GUARDIAN_VERIFICATION_PURPOSE, `its purpose is ${GUARDIAN_VERIFICATION_PURPOSE}`);
    ok(
      rows[0]!.token_hash === createHash("sha256").update(issued.token).digest("hex"),
      "the stored value is the SHA-256 of the token…",
    );
    ok(
      !rows[0]!.token_hash.includes(issued.token) && rows[0]!.token_hash !== issued.token,
      "…and the raw token appears nowhere in the row — a table dump is not a set of working links",
    );
    ok(
      rows[0]!.email === guardianOf(1),
      "the row records WHICH address the link was mailed to, so it cannot later confirm another",
    );
    const link = guardianVerifyLink(issued.token, "ar");
    ok(link.includes("/ar/guardian/verify?token=") && link.includes(encodeURIComponent(issued.token)),
      "the link is the public confirm page carrying the token");

    // =====================================================================
    console.log("\n[2] THE TOKEN MINTS NO SESSION — driven against the real claim door");
    // =====================================================================
    ok(
      !Object.prototype.hasOwnProperty.call(CLAIMABLE, GUARDIAN_VERIFICATION_PURPOSE),
      "the purpose is absent from CLAIMABLE",
    );
    const claimed = await claimDoor(issued.token);
    ok(!claimed.ok, "the real better-auth claim door REFUSES a guardian token");
    ok(!claimed.ok && claimed.message === "INVALID_TOKEN", "…with the same opaque code any bad token gets");
    const sessions = await q<{ n: number }>(
      `SELECT count(*)::int n FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [allUsers],
    );
    ok(sessions[0]!.n === 0, "and no session row exists for ANY fixture student");
    const stillUnused = await q<{ used_at: Date | null }>(
      `SELECT used_at FROM invite_tokens WHERE user_id = $1`, [fx.main],
    );
    ok(stillUnused[0]!.used_at === null, "the refused claim did not burn the token — the guardian's link still works");

    // =====================================================================
    console.log("\n[3] Confirm — the stamp, the burn, the audit row");
    // =====================================================================
    const before = await profileOf(fx.main);
    ok(!isGuardianEmailVerified(asProfile(before)), "before the click the address is UNVERIFIED");

    const result = await confirmGuardianEmail(issued.token);
    ok(result.verified === true, "the click confirms");
    ok(result.emailHint === maskEmail(guardianOf(1)), `the page is told only a masked hint (${result.emailHint})`);
    ok(
      !JSON.stringify(result).includes(guardianOf(1)),
      "…and the full address is nowhere in the response a stranger receives",
    );

    const after = await profileOf(fx.main);
    ok(after.guardian_email_verified_at !== null, "guardian_email_verified_at is stamped");
    ok(
      after.guardian_email_verified_value === guardianOf(1),
      "…and the stamp records WHICH address was proven",
    );
    ok(isGuardianEmailVerified(asProfile(after)), "so every reader now sees a verified guardian");

    const burned = await q<{ used_at: Date | null }>(
      `SELECT used_at FROM invite_tokens WHERE user_id = $1`, [fx.main],
    );
    ok(burned[0]!.used_at !== null, "the token is burned in the same transaction as the stamp");

    const auditRows = await q<{ actor_id: string | null; action: string; target_id: string; after_state: Record<string, unknown> }>(
      `SELECT actor_id, action, target_id, after_state FROM audit_logs
        WHERE action = 'student.guardian_email_verified' AND target_id = $1`,
      [after.id],
    );
    ok(auditRows.length === 1, "exactly one audit row records the confirmation");
    ok(auditRows[0]!.actor_id === null, "with NO actor — a guardian is not a user of this platform");
    ok(
      (auditRows[0]!.after_state as { guardianEmail?: string }).guardianEmail === guardianOf(1),
      "…and it names the address that was proven, which is the fact worth keeping",
    );

    // =====================================================================
    console.log("\n[4] Single use, and NO ORACLE — every failure says the same thing");
    // =====================================================================
    const reuse = await refusalMessage(() => confirmGuardianEmail(issued.token));
    ok(reuse === GENERIC, `a second click is refused: "${reuse}"`);

    const unknown = await refusalMessage(() => confirmGuardianEmail("a".repeat(43)));
    ok(unknown === GENERIC, "a token nobody ever minted returns the IDENTICAL message");

    const empty = await refusalMessage(() => confirmGuardianEmail(""));
    ok(empty === GENERIC, "an empty token too");

    // Expiry, made real by ageing the row rather than waiting a week.
    const exp = await issueGuardianVerification({ studentUserId: fx.expired, actorId: fx.expired });
    await q(`UPDATE invite_tokens SET expires_at = now() - interval '1 hour' WHERE user_id = $1`, [fx.expired]);
    const expiredMsg = await refusalMessage(() => confirmGuardianEmail(exp.token));
    ok(expiredMsg === GENERIC, "an expired link too");
    const expiredProfile = await profileOf(fx.expired);
    ok(
      expiredProfile.guardian_email_verified_at === null,
      "…and it stamped nothing — a refusal is a refusal all the way down",
    );

    // The address moved between the send and the click. The click proves the
    // OLD inbox, which says nothing about the new one.
    const moved = await issueGuardianVerification({ studentUserId: fx.moved, actorId: fx.moved });
    await q(`UPDATE student_profiles SET guardian_email = $2 WHERE user_id = $1`, [fx.moved, guardianOf(99)]);
    const movedMsg = await refusalMessage(() => confirmGuardianEmail(moved.token));
    ok(movedMsg === GENERIC, "a link mailed to an address that has since changed too");
    const movedProfile = await profileOf(fx.moved);
    ok(
      movedProfile.guardian_email_verified_value === null,
      "…and the NEW address was not silently stamped by a click nobody made on it",
    );

    ok(
      new Set([reuse, unknown, empty, expiredMsg, movedMsg]).size === 1,
      "all five failure modes are indistinguishable to a prober — one message, no oracle",
    );

    // =====================================================================
    console.log("\n[5] Editing the address UN-VERIFIES it");
    // =====================================================================
    const e1 = await issueGuardianVerification({ studentUserId: fx.edited, actorId: fx.edited });
    await confirmGuardianEmail(e1.token);
    const verified = await profileOf(fx.edited);
    ok(isGuardianEmailVerified(asProfile(verified)), "the third student's guardian address is verified");

    await q(`UPDATE student_profiles SET guardian_email = $2 WHERE user_id = $1`, [fx.edited, guardianOf(31)]);
    const edited = await profileOf(fx.edited);
    ok(
      edited.guardian_email_verified_at !== null && edited.guardian_email_verified_value === guardianOf(3),
      "the stamp is still on the row — it is a record of what WAS proven, not a boolean",
    );
    ok(
      !isGuardianEmailVerified(asProfile(edited)),
      "…yet every reader sees UNVERIFIED, because the stamp names an address that is no longer the one on file",
    );
    // Asserted by scanning the old link, not by reading the column: an operator
    // holding the previously-mailed link must not be able to re-prove the new
    // address with it.
    const reissued = await issueGuardianVerification({ studentUserId: fx.edited, actorId: fx.edited });
    const oldLink = await refusalMessage(() => confirmGuardianEmail(e1.token));
    ok(oldLink === GENERIC, "the previously-clicked link cannot confirm the new address");
    await confirmGuardianEmail(reissued.token);
    const reverified = await profileOf(fx.edited);
    ok(
      isGuardianEmailVerified(asProfile(reverified)) && reverified.guardian_email_verified_value === guardianOf(31),
      "a fresh link to the NEW address re-verifies, and the stamp moves to it",
    );

    // =====================================================================
    console.log("\n[6] A resend leaves ONE live link");
    // =====================================================================
    const r1 = await issueGuardianVerification({ studentUserId: fx.moved, actorId: fx.moved });
    const r2 = await issueGuardianVerification({ studentUserId: fx.moved, actorId: fx.moved });
    const live = await q<{ n: number }>(
      `SELECT count(*)::int n FROM invite_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [fx.moved, GUARDIAN_VERIFICATION_PURPOSE],
    );
    ok(live[0]!.n === 1, "after a resend exactly one unused token remains");
    ok((await refusalMessage(() => confirmGuardianEmail(r1.token))) === GENERIC, "the superseded link no longer confirms");
    ok((await confirmGuardianEmail(r2.token)).verified === true, "and the newest one does");

    // =====================================================================
    console.log("\n[7] Nothing to verify, and nothing else granted");
    // =====================================================================
    const noEmail = await refusalMessage(() =>
      issueGuardianVerification({ studentUserId: fx.none, actorId: fx.none }),
    );
    ok(/no guardian email/i.test(noEmail), `a student with no guardian address cannot be issued a link: "${noEmail}"`);
    const noTokens = await q<{ n: number }>(`SELECT count(*)::int n FROM invite_tokens WHERE user_id = $1`, [fx.none]);
    ok(noTokens[0]!.n === 0, "…and no token row was created for them");

    const ghost = await refusalMessage(() =>
      issueGuardianVerification({ studentUserId: "00000000-0000-0000-0000-000000000000", actorId: fx.main }),
    );
    ok(/not found/i.test(ghost), "a student that does not exist is a NotFound, not a minted token");

    const money = await q<{ n: number }>(
      `SELECT (SELECT count(*) FROM payments WHERE student_id = ANY($1::uuid[]))
            + (SELECT count(*) FROM transactions WHERE from_entity_id = ANY($1::uuid[]) OR to_entity_id = ANY($1::uuid[]))
            + (SELECT count(*) FROM wallet_ledger WHERE student_id = ANY($1::uuid[])) AS n`,
      [allUsers],
    );
    ok(Number(money[0]!.n) === 0, "verifying an address moved no money — not one row in any ledger");
    const statuses = await q<{ n: number }>(
      `SELECT count(*)::int n FROM users WHERE id = ANY($1::uuid[]) AND status <> 'active'`, [allUsers],
    );
    ok(statuses[0]!.n === 0, "and no account's status changed — verification is not a gate on the account");

    // =====================================================================
    console.log("\n[8] The number to watch before the messaging gate is flipped");
    // =====================================================================
    const statsAfter = await guardianVerificationStats();
    ok(
      statsAfter.withGuardianEmail - statsBefore.withGuardianEmail === 4,
      `stats counted the 4 fixture students with a guardian address (Δ ${statsAfter.withGuardianEmail - statsBefore.withGuardianEmail})`,
    );
    ok(
      statsAfter.verified - statsBefore.verified === 3,
      `…of which 3 ended verified (Δ ${statsAfter.verified - statsBefore.verified}) — students 1, 2 and 3`,
    );
    ok(
      statsAfter.unverified - statsBefore.unverified === 1,
      `…and 1 is still unverified (Δ ${statsAfter.unverified - statsBefore.unverified}) — the expired link nobody could click`,
    );
    ok(
      statsAfter.verified + statsAfter.unverified === statsAfter.withGuardianEmail,
      "verified + unverified accounts for every student with an address — the count cannot hide anyone",
    );
  } finally {
    const c = await admin.connect();
    try {
      const profiles = await c.query(`SELECT id FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      const profileIds = profiles.rows.map((r: { id: string }) => r.id);
      await c.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[])`, [profileIds]);
      await c.query(`DELETE FROM invite_tokens WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allUsers]);
      const left = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite guardian-verification.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
