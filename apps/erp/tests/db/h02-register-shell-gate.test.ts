// H-02 (SECURITY_AUDIT.md) — public registration must not activate a walk-in
// shell by phone or email match. Companion to the verbatim PoC
// (poc-h02-shell-merge-by-phone.test.ts). This pins the SHAPE of the fix:
//   [1] phone match on a shell → refused, message names the door, shell intact;
//   [2] email match on a shell → refused the same way (student AND teacher —
//       an external teacher is a shell too);
//   [3] the invite code still merges the shell it names, sets the password,
//       keeps the shell's wallet/roster, and is single-use afterwards;
//   [4] an invite code naming a shell whose contact differs from the caller's
//       still merges (the code is the proof, not the phone);
//   [5] a code for an already-claimed profile, or a bogus code, is refused
//       with one message — no oracle for which case it was.
import { withPlatformContext } from "@repo/database";
import { registerStudent, registerTeacher } from "@/lib/services/auth/register";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "h02-register-shell-gate.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e as Error & { code?: string }; } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const phone = () => "0100" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const PW = "Str0ngPassw0rd";
const CODES = { P1: ("P" + rid() + rid()).slice(0, 8), E1: ("E" + rid() + rid()).slice(0, 8), C1: ("C" + rid() + rid()).slice(0, 8), D1: ("D" + rid() + rid()).slice(0, 8) };
const DOOR = /registered at a centre/;

async function shellState(id: string) {
  return withPlatformContext((tx) => tx.user.findUniqueOrThrow({ where: { id }, select: { status: true, passwordHash: true, email: true } }));
}

async function main() {
  const tag = "h02s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const mkShell = async (k: string, code: string | null, email: string | null) => {
      const u = await tx.user.create({ data: { name: `${tag}-${k}`, role: "student", phone: phone(), email, status: "shell", passwordHash: null } });
      await tx.studentProfile.create({ data: { userId: u.id, fullName: `${tag}-${k}`, familyLinkCode: (tag + rid() + "00").slice(0, 18), walletBalance: 25000, entityType: "invited", inviteCode: code, phone: u.phone } });
      await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: u.id } });
      return u;
    };
    const byPhone = await mkShell("p", CODES.P1, null);
    const byEmail = await mkShell("e", CODES.E1, `${tag}-child@x.io`);
    const coded = await mkShell("c", CODES.C1, null);
    const claimed = await mkShell("d", CODES.D1, null);
    await tx.studentProfile.update({ where: { userId: claimed.id }, data: { entityType: "registered", claimedAt: new Date() } });
    const extTeacher = await tx.user.create({ data: { name: `${tag}-ext`, role: "teacher", email: `${tag}-ext@x.io`, phone: phone(), status: "shell", passwordHash: null } });
    await tx.teacherProfile.create({ data: { userId: extTeacher.id, systemStatus: "external", managedByCenterId: center.id } });
    return { center: center.id, byPhone, byEmail, coded, claimed, extTeacher };
  });

  console.log("\n[1] a stranger registers with the shell's phone");
  const e1 = await caught(() => registerStudent({ email: `${tag}-mallory@x.io`, password: PW, name: "Mallory", phone: fx.byPhone.phone! }));
  assert(e1?.code === "conflict" && DOOR.test(e1.message), `refused as a conflict that names the door (${e1?.message.slice(0, 60)})`);
  const s1 = await shellState(fx.byPhone.id);
  assert(s1.status === "shell" && s1.passwordHash === null, "the child's shell is untouched — still shell, no password");
  const strangers = await withPlatformContext((tx) => tx.user.count({ where: { email: `${tag}-mallory@x.io` } }));
  assert(strangers === 0, "and no account was created for the stranger either (nothing to clean up, nothing to confuse)");

  console.log("\n[2] the same with the shell's EMAIL — student and external teacher");
  const e2 = await caught(() => registerStudent({ email: `${tag}-child@x.io`, password: PW, name: "Mallory" }));
  assert(e2?.code === "conflict" && DOOR.test(e2.message), "student shell by email: refused");
  const e2t = await caught(() => registerTeacher({ email: `${tag}-ext@x.io`, password: PW, name: "Mallory T" }));
  assert(e2t?.code === "conflict" && DOOR.test(e2t.message), "external-teacher shell by email: refused (the teacher invite token is their door)");
  const t = await shellState(fx.extTeacher.id);
  assert(t.status === "shell" && t.passwordHash === null, "the external teacher shell is untouched");

  console.log("\n[3] the invite code still merges, and only once");
  const code = CODES.C1;
  const ok = await registerStudent({ email: `${tag}-real@x.io`, password: PW, name: "Real", phone: fx.coded.phone!, inviteCode: code });
  assert(ok.userId === fx.coded.id && ok.user.status === "active", "with the code, registration activates the shell it names");
  const merged = await withPlatformContext((tx) => tx.studentProfile.findUniqueOrThrow({ where: { userId: fx.coded.id }, select: { walletBalance: true, inviteCode: true, entityType: true } }));
  assert(merged.walletBalance === 25000 && merged.entityType === "registered", "the wallet and history stay with the (now real) account");
  assert(merged.inviteCode === null, "the code is consumed — it can never merge anything again");
  const again = await caught(() => registerStudent({ email: `${tag}-real2@x.io`, password: PW, name: "Again", inviteCode: code }));
  assert(again !== null && /not claimable/.test(again.message), "replaying the code is refused");

  console.log("\n[4] the code is the proof — a different phone still merges");
  const e4code = CODES.P1;
  const ok4 = await registerStudent({ email: `${tag}-other@x.io`, password: PW, name: "Other", phone: phone(), inviteCode: e4code });
  assert(ok4.userId === fx.byPhone.id, "code names the shell; the submitted phone need not match");

  console.log("\n[5] a code for an already-claimed profile, or a bogus one, is refused with ONE message");
  const e5a = await caught(() => registerStudent({ email: `${tag}-x1@x.io`, password: PW, name: "X", inviteCode: CODES.D1 }));
  const e5b = await caught(() => registerStudent({ email: `${tag}-x2@x.io`, password: PW, name: "X", inviteCode: "NOPE0000" }));
  assert(e5a?.message === e5b?.message && /not claimable/.test(e5a?.message ?? ""), `claimed and bogus codes are indistinguishable (${e5a?.message})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
