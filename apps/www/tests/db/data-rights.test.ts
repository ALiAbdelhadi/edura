/**
 * ===========================================================================
 * DATA RIGHTS (قانون 151/2020) + the center-owner audit viewer.
 * ===========================================================================
 * Drives the REAL shipped services against the live test DB:
 *   packages/server-core/src/services/data-rights/data-export.ts
 *   packages/server-core/src/services/data-rights/account-deletion.ts
 *   packages/server-core/src/services/center/center-audit.ts
 *
 * Each proof is about the BOUNDARY, not the happy path:
 *
 *   1. ONE subject gate — self yes; a stranger no; a parent only through an
 *      APPROVED link (pending / revoked / absent all refused).
 *   2. The in-flight rule is enforced by the DATABASE, not only by the service
 *      check — proven by going around the service with a raw INSERT.
 *   3. The export carries NO CREDENTIALS. Asserted against the serialized
 *      payload, so a future `include: true` cannot smuggle a password hash,
 *      session token or 2FA secret into a downloadable file.
 *   4. The worker claim is atomic — two workers racing one queued row produce
 *      exactly one winner.
 *   5. Expiry actually DROPS the copy (payload NULL, not merely a status), and
 *      the download refuses on the clock even before the sweeper has run.
 *   6. A MINOR cannot erase their own account; their approved guardian can;
 *      a VERIFIED adult can. Default-minor is the rule, so an unverified DOB
 *      is still a minor.
 *   7. Withdrawing records `cancelled`, never `rejected` — a data-rights
 *      report must not confuse "I changed my mind" with "we refused you".
 *   8. The center audit viewer cannot see another center, cannot see
 *      platform-level (NULL-center) rows, and its date filter includes the
 *      whole of its `to` day.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only data-rights
 * NEVER --env-file=.env: that is the DEV database and it skips the guard.
 * ===========================================================================
 */
import { withPlatformContext } from "@repo/database";
import {
  cancelDataExport,
  expireDataExports,
  getDataExportPayload,
  listDataExports,
  processNextDataExport,
  requestDataExport,
} from "@repo/server-core/services/data-rights/data-export";
import {
  getDeletionEligibility,
  getMyDeletionRequests,
  requestAccountDeletion,
  withdrawAccountDeletion,
} from "@repo/server-core/services/data-rights/account-deletion";
import { listCenterAuditLogs } from "@repo/server-core/services/center/center-audit";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

const SUITE_NAME = "data-rights.test.ts";
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

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

const asStudent = (id: string): SessionUser => ({ id, role: "student" }) as SessionUser;
const asParent = (id: string): SessionUser => ({ id, role: "parent" }) as SessionUser;
const asTeacher = (id: string): SessionUser => ({ id, role: "teacher" }) as SessionUser;
const asCenterAdmin = (id: string, centerId: string): SessionUser =>
  ({ id, role: "center_admin", centerId }) as SessionUser;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** `dob` present + `verified` is the ONLY way out of minor status. */
async function mkStudent(
  tag: string,
  suffix: string,
  opts: { dob?: Date; verified?: boolean } = {},
) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: `${tag}-${suffix}`,
        role: "student",
        email: `${tag}-${suffix}@x.io`,
        phone: `+2010${rid()}`.slice(0, 15),
        status: "active",
      },
    });
    await tx.studentProfile.create({
      data: {
        userId: u.id,
        fullName: `${tag}-${suffix}`,
        familyLinkCode: ("FC" + rid() + rid()).slice(0, 18),
        guardianEmail: `${tag}-${suffix}-guardian@x.io`,
        guardianPhone: "+201000000001",
        dateOfBirth: opts.dob ?? null,
        dateOfBirthVerifiedAt: opts.verified ? new Date() : null,
      },
    });
    return u.id;
  });
}

async function mkParent(tag: string, suffix: string) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-${suffix}`, role: "parent", email: `${tag}-${suffix}@x.io`, status: "active" },
    });
    await tx.parentProfile.create({ data: { userId: u.id, walletBalance: 0 } });
    return u.id;
  });
}

async function link(
  parentId: string,
  studentId: string,
  status: "approved" | "pending" | "revoked",
) {
  return withPlatformContext((tx) =>
    tx.parentStudentLink.create({ data: { parentId, studentId, status, initiatedBy: "parent" } }),
  );
}

async function mkCenter(tag: string, suffix: string) {
  return withPlatformContext(async (tx) => {
    const c = await tx.center.create({
      data: {
        name: `${tag}-${suffix}`,
        shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    return c.id;
  });
}

/** An audit row. `centerId: null` is what every PLATFORM-level action carries. */
async function auditRow(action: string, actorId: string, centerId: string | null, when?: Date) {
  return withPlatformContext((tx) =>
    tx.auditLog.create({
      data: {
        actorId,
        action,
        targetType: "user",
        targetId: actorId,
        centerId,
        afterState: { probe: true } as never,
        ...(when ? { createdAt: when } : {}),
      },
    }),
  );
}

/** Drive the queued export all the way to `ready`. */
async function buildExport(actor: SessionUser, subjectId?: string) {
  const req = await requestDataExport(actor, subjectId);
  await processNextDataExport();
  return req.id;
}

// ---------------------------------------------------------------------------

async function main() {
  const tag = "drtest-" + rid();
  __sweepTag = tag;
  console.log("Data rights —", tag);

  const adultStudent = await mkStudent(tag, "adult", {
    dob: new Date("2000-01-01"),
    verified: true,
  });
  // No DOB at all: DEFAULT-MINOR.
  const minorStudent = await mkStudent(tag, "minor");
  // A DOB proving 18+, but NOBODY VERIFIED IT — still a minor.
  const unverifiedStudent = await mkStudent(tag, "unver", { dob: new Date("1995-05-05") });
  const guardian = await mkParent(tag, "guardian");
  const stranger = await mkParent(tag, "stranger");
  const pendingParent = await mkParent(tag, "pending");
  const revokedParent = await mkParent(tag, "revoked");
  const outsider = await mkStudent(tag, "outsider");

  await link(guardian, minorStudent, "approved");
  await link(pendingParent, minorStudent, "pending");
  await link(revokedParent, minorStudent, "revoked");

  // ─────────────────────────────────────────────────────────────────────
  section("1. The subject gate — one implementation, every caller");

  const selfOk = await requestDataExport(asStudent(adultStudent));
  assert(!!selfOk.id, "a person may export their OWN data");

  const strangerTry = await rejects(
    () => requestDataExport(asParent(stranger), minorStudent),
    /not linked/i,
  );
  assert(strangerTry.threw && strangerTry.matched, "an unlinked parent is refused");

  const pendingTry = await rejects(
    () => requestDataExport(asParent(pendingParent), minorStudent),
    /not linked/i,
  );
  assert(pendingTry.threw && pendingTry.matched, "a PENDING link is refused — approval is the point");

  const revokedTry = await rejects(
    () => requestDataExport(asParent(revokedParent), minorStudent),
    /not linked/i,
  );
  assert(revokedTry.threw && revokedTry.matched, "a REVOKED link stops working immediately");

  const teacherTry = await rejects(
    () => requestDataExport(asTeacher(outsider), adultStudent),
    /only act on your own data/i,
  );
  assert(teacherTry.threw && teacherTry.matched, "a non-parent role cannot act for anyone else");

  const guardianReq = await requestDataExport(asParent(guardian), minorStudent);
  assert(!!guardianReq.id, "an APPROVED guardian may export their child's data");

  const attribution = await withPlatformContext((tx) =>
    tx.dataExportRequest.findUnique({ where: { id: guardianReq.id } }),
  );
  assert(
    attribution?.userId === minorStudent && attribution?.requestedBy === guardian,
    "the row records WHOSE data it is and WHO asked — permanently distinguishable",
  );

  // ─────────────────────────────────────────────────────────────────────
  section("2. One in flight — enforced by the DATABASE, not just the service");

  const dupe = await rejects(() => requestDataExport(asStudent(adultStudent)), /already being prepared/i);
  assert(dupe.threw && dupe.matched, "the service refuses a second queued export");

  // Go AROUND the service. If the partial unique index were missing, this
  // insert would succeed and the service check would be the only guard.
  const rawDupe = await rejects(
    () =>
      withPlatformContext((tx) =>
        tx.dataExportRequest.create({
          data: { userId: adultStudent, requestedBy: adultStudent, status: "pending" },
        }),
      ),
    /unique|constraint|P2002/i,
  );
  assert(
    rawDupe.threw && rawDupe.matched,
    "the DB refuses it too — data_export_requests_one_in_flight bites",
  );

  // ─────────────────────────────────────────────────────────────────────
  section("3. The export carries data, and NO credentials");

  const built = await processNextDataExport();
  assert(built.processed !== null, "the worker claims and builds a queued export");

  const readyRows = await listDataExports(asStudent(adultStudent));
  const ready = readyRows.find((r) => r.status === "ready");
  assert(!!ready, "the subject sees it as ready");

  const { payload } = await getDataExportPayload(asStudent(adultStudent), ready!.id);
  const serialized = JSON.stringify(payload);
  const doc = payload as Record<string, Record<string, unknown>>;

  assert(doc.account?.id === adultStudent, "the payload contains the account");
  assert(typeof doc.account?.email === "string", "…including the email we hold");
  assert(Array.isArray(doc.payments), "…the payments collection");
  assert(!!doc._meta?.lawReference, "…and a header naming the law it answers to");

  // The load-bearing one. Asserted on the SERIALIZED string so a nested
  // `include: true` anywhere in the builder would trip it.
  assert(!/passwordHash|password_hash/i.test(serialized), "NO password hash anywhere in the file");
  assert(!/tokenVersion|token_version/i.test(serialized), "no session epoch");
  assert(
    !/"secret"|backupCodes|backup_codes|twoFactor/i.test(serialized),
    "no 2FA secret or backup codes",
  );
  assert(!/authSession|auth_sessions|sessionToken/i.test(serialized), "no session tokens");

  // ─────────────────────────────────────────────────────────────────────
  section("4. Download is gated by the same rule as the request");

  const foreignRead = await rejects(
    () => getDataExportPayload(asParent(stranger), ready!.id),
    /not linked|only act on your own/i,
  );
  assert(foreignRead.threw, "a stranger cannot download somebody else's export");

  const childReads = await rejects(
    () => getDataExportPayload(asStudent(outsider), ready!.id),
    /only act on your own/i,
  );
  assert(childReads.threw && childReads.matched, "…and neither can an unrelated student");

  // ─────────────────────────────────────────────────────────────────────
  section("5. The worker claim is atomic");

  // DRAIN FIRST. The claim takes the OLDEST pending row globally, so with
  // anything else still queued the two workers below would simply take
  // different rows and "one winner" would pass without testing anything.
  // (This is exactly how the assertion first passed a broken premise.)
  for (let i = 0; i < 50; i++) {
    const { processed } = await processNextDataExport();
    if (!processed) break;
  }
  const drained = await withPlatformContext((tx) =>
    tx.dataExportRequest.count({ where: { status: { in: ["pending", "processing"] } } }),
  );
  assert(drained === 0, "the queue is empty, so the race below is genuinely on ONE row");

  const racer = await mkStudent(tag, "race");
  await requestDataExport(asStudent(racer));
  const [a, b] = await Promise.all([processNextDataExport(), processNextDataExport()]);
  const winners = [a.processed, b.processed].filter(Boolean);
  assert(
    winners.length === 1,
    `exactly one worker claims that row; the loser is a clean no-op (got ${winners.length})`,
  );
  const racerRow = await withPlatformContext((tx) =>
    tx.dataExportRequest.findFirst({ where: { userId: racer } }),
  );
  assert(racerRow?.status === "ready", "…and the row was built exactly once");

  // ─────────────────────────────────────────────────────────────────────
  section("6. Expiry DROPS the copy, and the clock outranks the column");

  const expiring = await mkStudent(tag, "expire");
  const expId = await buildExport(asStudent(expiring));

  // Backdate the expiry: the payload is now past its life but the sweeper
  // has not run, so the row still SAYS ready.
  await withPlatformContext((tx) =>
    tx.dataExportRequest.update({
      where: { id: expId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    }),
  );

  const stale = await rejects(
    () => getDataExportPayload(asStudent(expiring), expId),
    /expired/i,
  );
  assert(stale.threw && stale.matched, "the download refuses on the CLOCK, before any sweep");

  const listedStale = await listDataExports(asStudent(expiring));
  assert(
    listedStale.find((r) => r.id === expId)?.status === "expired",
    "the list reports it as expired too — the screen never offers a dead download",
  );

  const swept = await expireDataExports();
  assert(swept.expired >= 1, "the sweeper claims at least this one");

  const afterSweep = await withPlatformContext((tx) =>
    tx.dataExportRequest.findUnique({ where: { id: expId } }),
  );
  assert(afterSweep?.status === "expired", "status is expired");
  assert(
    afterSweep?.payload === null,
    "the PAYLOAD IS GONE — expiry drops the copy, not merely its label",
  );
  assert(afterSweep?.byteSize === null, "…and the size with it");

  // ─────────────────────────────────────────────────────────────────────
  section("7. Cancel — only while nothing has been produced");

  const canceller = await mkStudent(tag, "cancel");
  const toCancel = await requestDataExport(asStudent(canceller));
  const cancelled = await cancelDataExport(asStudent(canceller), toCancel.id);
  assert(cancelled.cancelled, "a queued export can be withdrawn");
  const goneRow = await withPlatformContext((tx) =>
    tx.dataExportRequest.findUnique({ where: { id: toCancel.id } }),
  );
  assert(goneRow === null, "the row is removed — it produced nothing to be evidence of");

  const readyCancel = await rejects(
    () => cancelDataExport(asStudent(adultStudent), ready!.id),
    /only a queued export/i,
  );
  assert(readyCancel.threw && readyCancel.matched, "a BUILT export cannot be silently withdrawn");

  // ─────────────────────────────────────────────────────────────────────
  section("8. Deletion — DEFAULT-MINOR decides who may ask");

  const minorEl = await getDeletionEligibility(asStudent(minorStudent));
  assert(minorEl.isMinor, "a student with no DOB is a minor");
  assert(!minorEl.canRequestSelf, "…and may NOT erase their own account");

  const unverEl = await getDeletionEligibility(asStudent(unverifiedStudent));
  assert(
    unverEl.isMinor && !unverEl.canRequestSelf,
    "a DOB proving 18+ that NOBODY VERIFIED is still a minor — default-minor holds",
  );

  const adultEl = await getDeletionEligibility(asStudent(adultStudent));
  assert(!adultEl.isMinor && adultEl.canRequestSelf, "a VERIFIED adult may ask for themselves");

  const minorSelf = await rejects(
    () => requestAccountDeletion(asStudent(minorStudent), {}),
    /approved guardian/i,
  );
  assert(
    minorSelf.threw && minorSelf.matched,
    "a minor's self-request is refused, and the message names the remedy",
  );

  const byGuardian = await requestAccountDeletion(asParent(guardian), {
    subjectUserId: minorStudent,
    reason: "no longer attending",
  });
  assert(byGuardian.origin === "guardian", "the guardian's request is recorded as guardian-origin");

  const strangerDel = await rejects(
    () => requestAccountDeletion(asParent(stranger), { subjectUserId: adultStudent }),
    /not linked|only act on your own/i,
  );
  assert(strangerDel.threw, "a stranger cannot request somebody else's deletion");

  const platformDesk = await withPlatformContext((tx) =>
    tx.deletionRequest.findUnique({ where: { id: byGuardian.id } }),
  );
  assert(
    platformDesk?.centerId === null,
    "a self/guardian request carries NO center — it lands on the platform desk, not a center's",
  );
  assert(platformDesk?.requestedBy === guardian, "…and names who raised it");

  // ─────────────────────────────────────────────────────────────────────
  section("9. One open request per subject, and withdrawal is not rejection");

  const secondOpen = await rejects(
    () => requestAccountDeletion(asParent(guardian), { subjectUserId: minorStudent }),
    /already under review/i,
  );
  assert(secondOpen.threw && secondOpen.matched, "a second open request is refused");

  const rawOpen = await rejects(
    () =>
      withPlatformContext((tx) =>
        tx.deletionRequest.create({
          data: { userId: minorStudent, reason: "raw", status: "pending", origin: "self" },
        }),
      ),
    /unique|constraint|P2002/i,
  );
  assert(
    rawOpen.threw && rawOpen.matched,
    "the DB refuses it too — deletion_requests_one_open_per_user bites",
  );

  const withdrawn = await withdrawAccountDeletion(asParent(guardian), byGuardian.id);
  assert(
    withdrawn.status === "cancelled",
    "withdrawing records CANCELLED — never 'rejected', which is somebody else's decision",
  );

  const twice = await rejects(
    () => withdrawAccountDeletion(asParent(guardian), byGuardian.id),
    /already cancelled/i,
  );
  assert(twice.threw && twice.matched, "it cannot be withdrawn twice");

  const history = await getMyDeletionRequests(asParent(guardian), minorStudent);
  assert(history.length === 1 && history[0]?.status === "cancelled", "the subject sees their history");

  const untouched = await withPlatformContext((tx) =>
    tx.user.findUnique({ where: { id: minorStudent }, select: { status: true, name: true } }),
  );
  assert(
    untouched?.status === "active" && untouched.name.includes(tag),
    "REQUESTING IS NOT DELETING — the account is untouched while it waits",
  );

  // ─────────────────────────────────────────────────────────────────────
  section("10. Center audit viewer — scope is the session's, not the request's");

  const centerA = await mkCenter(tag, "ca");
  const centerB = await mkCenter(tag, "cb");
  const staff = await mkStudent(tag, "actor");

  await auditRow("center.profile_updated", staff, centerA);
  await auditRow("center.room_created", staff, centerA);
  await auditRow("center.profile_updated", staff, centerB);
  // A PLATFORM action: no center. This is the row that must not leak.
  await auditRow("user.suspended", staff, null);

  const ownerA = asCenterAdmin(staff, centerA);
  const seenA = await listCenterAuditLogs(ownerA, {});
  assert(seenA.total === 2, `center A sees exactly its own 2 rows (got ${seenA.total})`);
  assert(
    seenA.data.every((r) => r.action.startsWith("center.")),
    "…and none of them is a platform action",
  );

  const seenB = await listCenterAuditLogs(asCenterAdmin(staff, centerB), {});
  assert(seenB.total === 1, "center B sees only its own row — no cross-tenant bleed");

  const noScope = await rejects(
    () => listCenterAuditLogs(asStudent(staff), {}),
    /no center scope/i,
  );
  assert(noScope.threw && noScope.matched, "an actor with no centerId is refused outright");

  const prefixed = await listCenterAuditLogs(ownerA, { action: "center.room" });
  assert(prefixed.total === 1, "the action filter is a prefix match");

  const actorNamed = seenA.data.every((r) => r.actorName !== null);
  assert(actorNamed, "the actor resolves to a name — an audit row is never anonymous here");

  // A date-only `to` must mean the END of that day; without that, filtering
  // "up to today" silently drops everything that happened today.
  const today = new Date().toISOString().slice(0, 10);
  const sameDay = await listCenterAuditLogs(ownerA, { from: today, to: today });
  assert(
    sameDay.total === 2,
    `a date-only 'to' includes the whole day (got ${sameDay.total} of 2)`,
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
