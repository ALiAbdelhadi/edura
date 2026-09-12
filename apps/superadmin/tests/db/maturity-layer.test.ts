import { testPool } from "../../../../packages/database/scripts/test-pool";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withPlatformContext } from "@repo/database";
import {
  clearFeatureFlagCache,
  isFeatureEnabled,
  listFeatureFlags,
  setFeatureFlag,
  KNOWN_FEATURE_FLAGS,
} from "@repo/server-core/services/platform/feature-flags";
import {
  anonymizeApproved,
  approveDeletion,
  listDeletionQueue,
  rejectDeletion,
  requestAccountDeletion,
} from "@repo/server-core/services/data-rights/account-deletion";
import {
  listContactSubmissions,
  setContactSubmissionStatus,
} from "@/lib/services/admin/contact-submissions";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";

const admin = testPool();

const SUITE_NAME = "maturity-layer.test.ts";
let __sweepTag = "";

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
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

const createdUsers: string[] = [];
const createdCenters: string[] = [];

const asSuper = (id: string): SessionUser => ({ id, role: "super_admin" }) as SessionUser;
const asAccountant = (id: string): SessionUser => ({ id, role: "accountant" }) as SessionUser;
const asParent = (id: string): SessionUser => ({ id, role: "parent" }) as SessionUser;
const asStudent = (id: string): SessionUser => ({ id, role: "student" }) as SessionUser;

async function mkUser(tag: string, role: string, suffix: string) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: `${tag}-${suffix}`,
        role: role as never,
        email: `${tag}-${suffix}@x.io`,
        phone: `+2011${rid()}`.slice(0, 15),
        status: "active",
      },
    });
    createdUsers.push(u.id);
    return u.id;
  });
}

async function mkStudent(tag: string, suffix: string, opts: { verifiedAdult?: boolean } = {}) {
  const id = await mkUser(tag, "student", suffix);
  await withPlatformContext((tx) =>
    tx.studentProfile.create({
      data: {
        userId: id,
        fullName: `${tag}-${suffix} REAL NAME`,
        phone: "+201000000009",
        familyLinkCode: ("FC" + rid() + rid()).slice(0, 18),
        guardianEmail: `${tag}-${suffix}-guardian@x.io`,
        guardianPhone: "+201000000008",
        dateOfBirth: opts.verifiedAdult ? new Date("1999-02-02") : new Date("2010-03-03"),
        dateOfBirthVerifiedAt: opts.verifiedAdult ? new Date() : null,
      },
    }),
  );
  return id;
}

async function approveLink(parentId: string, studentId: string) {
  return withPlatformContext((tx) =>
    tx.parentStudentLink.create({
      data: { parentId, studentId, status: "approved", initiatedBy: "parent" },
    }),
  );
}

async function mkMoney(tag: string, studentId: string) {
  return withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    createdCenters.push(center.id);
    const payment = await tx.payment.create({
      data: {
        centerId: center.id,
        studentId,
        amount: 45000,
        receiptNumber: `${tag.toUpperCase()}-0001`,
        recordedBy: studentId,
        note: "proof fixture",
      },
    });
    const txn = await tx.transaction.create({
      data: {
        refNumber: `TXN-${tag.toUpperCase()}-1`,
        type: "payment",
        amount: 45000,
        fromEntityId: studentId,
        toEntityId: center.id,
        centerId: center.id,
        status: "completed",
        paymentMethod: "cash",
      },
    });
    return { centerId: center.id, paymentId: payment.id, txnId: txn.id };
  });
}

async function plantSession(userId: string): Promise<string> {
  const row = (
    await admin.query(
      `INSERT INTO auth_sessions (token, user_id, expires_at, updated_at, ip_address, user_agent)
       VALUES (gen_random_uuid()::text, $1::uuid, now() + interval '7 days', now(), '203.0.113.9', 'maturity-proof')
       RETURNING id`,
      [userId],
    )
  ).rows[0];
  return row.id as string;
}

async function mkSubmission(tag: string, suffix: string) {
  return withPlatformContext(async (tx) => {
    const row = await tx.contactSubmission.create({
      data: {
        name: `${tag}-${suffix}`,
        email: `${tag}-${suffix}@public.example`,
        message: `أريد الاشتراك — ${tag} ${suffix}. Please call me back on Sunday.`,
        subject: "استفسار",
        source: "landing",
      },
    });
    return row.id;
  });
}

async function main() {
  const tag = "mltest-" + rid();
  __sweepTag = tag;
  console.log("Maturity layer —", tag);

  const root = await mkUser(tag, "super_admin", "root");
  const accountant = await mkUser(tag, "accountant", "acct");
  const guardian = await mkUser(tag, "parent", "guardian");
  const subject = await mkStudent(tag, "subject");
  await approveLink(guardian, subject);
  const second = await mkStudent(tag, "second", { verifiedAdult: true });
  const actor = asSuper(root);

  const money = await mkMoney(tag, subject);

  section("1. Feature flags — absent means OFF");

  const unknownKey = `${tag}.never.stored`;
  assert((await isFeatureEnabled(unknownKey)) === false, "a key with no row reads as DISABLED");
  clearFeatureFlagCache();
  assert(
    (await isFeatureEnabled(unknownKey, { fallbackWhenMissing: true })) === true,
    "…and the opposite requires saying so explicitly",
  );

  const listed = await listFeatureFlags();
  const known = listed.find((f) => f.key === KNOWN_FEATURE_FLAGS[0].key);
  assert(!!known, "a key code knows about is listed even with no row");
  assert(
    known?.persisted === false && known?.enabled === false,
    "…as 'never set', which is NOT the same claim as 'somebody turned it off'",
  );

  section("2. Flipping a flag is audited, and takes effect at once");

  const key = `${tag}.probe`;
  await setFeatureFlag(root, key, true, { note: "incident drill" });
  assert((await isFeatureEnabled(key)) === true, "enabling takes effect on the next read");

  const audit1 = await q(
    `SELECT actor_id, action, before_state, after_state FROM audit_logs
      WHERE action = 'feature_flag.updated' AND after_state->>'key' = $1 ORDER BY created_at`,
    [key],
  );
  assert(audit1.length === 1, "the flip wrote exactly one audit row");
  assert(audit1[0].actor_id === root, "…naming who flipped it");
  assert(
    audit1[0].before_state?.persisted === false,
    "…and recording that no row existed before, not a fabricated 'was off'",
  );

  await setFeatureFlag(root, key, false);
  assert(
    (await isFeatureEnabled(key)) === false,
    "disabling is visible immediately — a kill switch must not wait for a TTL",
  );

  const badKey = await rejects(() => setFeatureFlag(root, "Not A Key", true), /lowercase|dotted/i);
  assert(badKey.threw && badKey.matched, "a malformed key is refused");

  section("3. Contact inbox — triage cannot rewrite what somebody said");

  const subId = await mkSubmission(tag, "msg");
  const beforeRow = (
    await q(`SELECT name, email, message, subject, source FROM contact_submissions WHERE id=$1::uuid`, [
      subId,
    ])
  )[0];

  const listedSubs = await listContactSubmissions({ q: tag });
  assert(listedSubs.total >= 1, "the inbox finds it by free-text search");
  assert(listedSubs.newCount >= 1, "…and reports the waiting count");

  await setContactSubmissionStatus(actor, subId, "handled", "called back");

  const afterRow = (
    await q(
      `SELECT name, email, message, subject, source, status, handled_by, handled_note
         FROM contact_submissions WHERE id=$1::uuid`,
      [subId],
    )
  )[0];

  assert(afterRow.status === "handled", "the status moved");
  assert(afterRow.handled_by === root, "…attributed to the operator");
  assert(
    afterRow.name === beforeRow.name &&
      afterRow.email === beforeRow.email &&
      afterRow.message === beforeRow.message &&
      afterRow.subject === beforeRow.subject &&
      afterRow.source === beforeRow.source,
    "EVERY column the sender wrote is byte-identical — an inbox that can be edited is not evidence",
  );

  const triageAudit = await q(
    `SELECT action FROM audit_logs WHERE target_id=$1::uuid AND action='contact_submission.triaged'`,
    [subId],
  );
  assert(triageAudit.length === 1, "the triage decision is audited");

  section("4. The deletion desk refuses the wrong hands and the wrong shape");

  const req = await requestAccountDeletion(asParent(guardian), {
    subjectUserId: subject,
    reason: "leaving the platform",
  });
  assert(req.origin === "guardian", "the request arrives guardian-origin");

  const notAdmin = await rejects(() => approveDeletion(asAccountant(accountant), req.id, "ok"), /.*/);
  assert(notAdmin.threw, "an accountant cannot approve a deletion");

  const noNote = await rejects(() => approveDeletion(actor, req.id, "   "), /review note is required/i);
  assert(noNote.threw && noNote.matched, "approving without a note is refused");

  const noReason = await rejects(() => rejectDeletion(actor, req.id, ""), /reason is required/i);
  assert(
    noReason.threw && noReason.matched,
    "rejecting without a reason is refused — an erasure refusal is appealable by law",
  );

  const queue = await listDeletionQueue(actor, { status: "pending" });
  assert(
    queue.data.some((r) => r.id === req.id),
    "the pending request is on the platform desk",
  );
  const listedByAcct = await rejects(() => listDeletionQueue(asAccountant(accountant), {}), /.*/);
  assert(listedByAcct.threw, "…and an accountant cannot even read the queue");

  section("5. Approval erases the PERSON and keeps the BOOKS");

  await plantSession(subject);
  const liveBefore = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
    subject,
  ]);
  assert(liveBefore[0].n === 1, "the subject has a live session before erasure");

  const payBefore = (
    await q(`SELECT amount, receipt_number, student_id, center_id FROM payments WHERE id=$1::uuid`, [
      money.paymentId,
    ])
  )[0];
  const txnBefore = (
    await q(`SELECT amount, ref_number, from_entity_id, status FROM transactions WHERE id=$1::uuid`, [
      money.txnId,
    ])
  )[0];

  await approveDeletion(actor, req.id, "verified identity, request granted");

  const userAfter = (
    await q(
      `SELECT name, email, phone, image, status, deleted_at, token_version FROM users WHERE id=$1::uuid`,
      [subject],
    )
  )[0];
  assert(userAfter.status === "deleted", "the account is disabled");
  assert(!!userAfter.deleted_at, "…and stamped");
  assert(!userAfter.name.includes(tag), "the NAME is gone");
  assert(
    typeof userAfter.email === "string" && userAfter.email.endsWith("@anonymized.invalid"),
    "the email is replaced with an undeliverable reserved-TLD address",
  );
  assert(userAfter.phone === null, "the phone is gone");

  const profAfter = (
    await q(
      `SELECT full_name, phone, guardian_email, guardian_phone, date_of_birth
         FROM student_profiles WHERE user_id=$1::uuid`,
      [subject],
    )
  )[0];
  assert(!profAfter.full_name.includes(tag), "the student profile's real name is gone");
  assert(profAfter.phone === null, "…their phone");
  assert(profAfter.guardian_email === null && profAfter.guardian_phone === null, "…the guardian's contact");
  assert(profAfter.date_of_birth === null, "…and their date of birth");

  const payAfter = (
    await q(`SELECT amount, receipt_number, student_id, center_id FROM payments WHERE id=$1::uuid`, [
      money.paymentId,
    ])
  )[0];
  const txnAfter = (
    await q(`SELECT amount, ref_number, from_entity_id, status FROM transactions WHERE id=$1::uuid`, [
      money.txnId,
    ])
  )[0];

  assert(!!payAfter && !!txnAfter, "the payment and its ledger row still EXIST");
  assert(
    payAfter.amount === payBefore.amount && payAfter.receipt_number === payBefore.receipt_number,
    "the receipt is unchanged — the accountant can still reconcile it",
  );
  assert(
    payAfter.student_id === subject && txnAfter.from_entity_id === subject,
    "…and still resolves to the account id, which survives the erasure",
  );
  assert(
    txnAfter.amount === txnBefore.amount &&
      txnAfter.ref_number === txnBefore.ref_number &&
      txnAfter.status === txnBefore.status,
    "the ledger transaction is byte-identical",
  );

  const viaPrisma = await rejects(
    () => withPlatformContext((tx) => tx.transaction.delete({ where: { id: money.txnId } })),
    /append-only/i,
  );
  assert(
    viaPrisma.threw && viaPrisma.matched,
    "the append-only extension refuses a ledger delete at the app layer",
  );

  const viaRawSql = await rejects(
    () =>
      withPlatformContext((tx) =>
        tx.$executeRaw`DELETE FROM transactions WHERE id = ${money.txnId}::uuid`,
      ),
    /permission denied/i,
  );
  assert(
    viaRawSql.threw && viaRawSql.matched,
    "and RAW SQL — with the extension bypassed entirely — is refused by the DATABASE",
  );

  const grants = await q(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name='transactions' AND grantee='edura_app' ORDER BY 1`,
  );
  const granted = grants.map((r) => r.privilege_type).sort().join(",");
  assert(
    granted === "INSERT,SELECT",
    `the app role holds ONLY INSERT and SELECT on the ledger (holds: ${granted || "nothing"})`,
  );

  const stillThere = await q(`SELECT 1 FROM transactions WHERE id=$1::uuid`, [money.txnId]);
  assert(stillThere.length === 1, "…and the row is still there after both attempts");

  const liveAfter = await q(`SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1::uuid`, [
    subject,
  ]);
  assert(liveAfter[0].n === 0, "the live session died with the name (C-03), same statement");

  section("6. The audit row proves it happened without repeating what was erased");

  const delAudit = (
    await q(
      `SELECT actor_id, before_state, after_state FROM audit_logs
        WHERE target_id=$1::uuid AND action='account_deletion.executed'`,
      [subject],
    )
  )[0];
  assert(!!delAudit, "the erasure is audited");
  assert(delAudit.actor_id === root, "…naming who ordered it");
  const auditBlob = JSON.stringify(delAudit.before_state) + JSON.stringify(delAudit.after_state);
  assert(
    !auditBlob.includes(tag),
    "the audit row does NOT contain the erased name or email — audit_logs is append-only, so a copy there would be the one nobody could remove",
  );
  assert(
    delAudit.after_state?.ledgerRetained === true &&
      delAudit.after_state?.personalDataRetained === false,
    "…and states plainly which half survived",
  );

  const reqAfter = (
    await q(`SELECT status, anonymized_at, anonymized_by, review_note FROM deletion_requests WHERE id=$1::uuid`, [
      req.id,
    ])
  )[0];
  assert(reqAfter.status === "approved", "the queue row is approved");
  assert(!!reqAfter.anonymized_at && reqAfter.anonymized_by === root, "…and stamped as anonymized");
  assert(!!reqAfter.review_note, "…carrying the reviewer's note");

  const decidedTwice = await rejects(
    () => approveDeletion(actor, req.id, "again"),
    /already approved/i,
  );
  assert(decidedTwice.threw && decidedTwice.matched, "a decided request cannot be decided again");

  const alreadyAnon = await rejects(() => anonymizeApproved(actor, req.id), /already anonymized/i);
  assert(alreadyAnon.threw && alreadyAnon.matched, "and the repair path refuses a finished one");

  section("7. A second erasure does not collide with the first");

  const req2 = await requestAccountDeletion(asStudent(second), {});
  await approveDeletion(actor, req2.id, "second subject");
  const two = await q(
    `SELECT email FROM users WHERE id = ANY($1::uuid[]) ORDER BY email`,
    [[subject, second]],
  );
  assert(
    two.length === 2 && two[0].email !== two[1].email,
    "two erased accounts keep DISTINCT emails — the id discriminates, so UNIQUE still holds",
  );

  section("8. The deletion module holds no money");

  const src = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../packages/server-core/src/services/data-rights/account-deletion.ts",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const imports = src
    .split("\n")
    .filter((l) => l.startsWith("import"))
    .join("\n");
  assert(
    !/(wallet|payout|ledger|transaction|invoice|settlement)/i.test(imports),
    "it imports nothing from a money service — checkable by reading one import list",
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
    try {
      const u = [createdUsers];
      const c = [createdCenters];
      await admin.query(`DELETE FROM deletion_requests WHERE user_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM data_export_requests WHERE user_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM parent_student_links WHERE parent_id = ANY($1::uuid[]) OR student_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM transactions WHERE center_id = ANY($1::uuid[])`, c);
      await admin.query(`DELETE FROM payments WHERE student_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, u);
      await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, c);
      await admin.query(`DELETE FROM contact_submissions WHERE name LIKE $1`, [`${__sweepTag}%`]);
      await admin.query(`DELETE FROM feature_flags WHERE key LIKE $1`, [`${__sweepTag}%`]);
      await admin.query(`DELETE FROM audit_logs WHERE after_state->>'key' LIKE $1`, [
        `${__sweepTag}%`,
      ]);
    } catch (e) {
      console.error("  ↳ teardown FAILED (rows left behind):", (e as Error).message);
    }
    await admin.end();
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
