// AUTHZ-01 (SECURITY_AUDIT.md 2026-09-11) — a centre manager must not be able
// to rewrite a credentialed student's LOGIN email or phone through the roster
// PATCH. `requestPasswordReset` looks users up by email, so that write was a
// password-reset takeover of an account that is usually a minor's. Pins:
//   [1] email/phone on a student who holds a password → refused, row unchanged;
//   [2] a name-only patch on the same student still works;
//   [3] a walk-in shell (no password yet) still gets its login details filled
//       in at the counter, and the change is audited;
//   [4] the attacker's address matches nobody, so a reset cannot be requested.
import bcrypt from "bcryptjs";
import { withPlatformContext } from "@repo/database";
import { updateRosterStudent } from "@repo/server-core/services/center/roster";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "authz01-roster-login-identity.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function refusal(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return "<<SUCCEEDED>>"; } catch (e) { return (e as Error).message ?? ""; }
}
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

const userRow = (id: string) =>
  withPlatformContext((tx) => tx.user.findUniqueOrThrow({ where: { id }, select: { email: true, phone: true, name: true } }));

async function main() {
  const tag = "a01r-" + rid(); __sweepTag = tag;
  const attackerEmail = `${tag}-attacker@x.io`;

  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });

    const hash = await bcrypt.hash("Student!1", 10);
    const cred = await tx.user.create({ data: { name: `${tag}-cred`, role: "student", email: `${tag}-cred@x.io`, phone: "+201000000001", status: "active", passwordHash: hash } });
    await tx.studentProfile.create({ data: { userId: cred.id, fullName: `${tag}-cred`, familyLinkCode: (tag + rid() + "01").slice(0, 18) } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: cred.id } });

    const shell = await tx.user.create({ data: { name: `${tag}-shell`, role: "student", email: null, phone: "+201000000002", status: "shell", passwordHash: null } });
    await tx.studentProfile.create({ data: { userId: shell.id, fullName: `${tag}-shell`, familyLinkCode: (tag + rid() + "02").slice(0, 18), entityType: "invited" } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: shell.id } });

    return { owner: owner.id, center: center.id, cred: cred.id, shell: shell.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center, locale: "en" } as SessionUser;

  console.log("\n[1] a credentialed student's login email and phone are refused at the counter");
  const before = await userRow(fx.cred);
  const e1 = await refusal(() => updateRosterStudent(owner, fx.cred, { email: attackerEmail }));
  assert(/has set a password/.test(e1), `email rewrite refused (${e1.slice(0, 60)})`);
  const e2 = await refusal(() => updateRosterStudent(owner, fx.cred, { phone: "+201099999999" }));
  assert(/has set a password/.test(e2), `phone rewrite refused (${e2.slice(0, 60)})`);
  const e3 = await refusal(() => updateRosterStudent(owner, fx.cred, { name: "x", email: attackerEmail }));
  assert(/has set a password/.test(e3), "…and a mixed patch that carries an identifier is refused whole");
  const after = await userRow(fx.cred);
  assert(after.email === before.email && after.phone === before.phone && after.name === before.name, "the users row is byte-identical after the three refusals");

  console.log("\n[2] a name-only patch on the same student still works");
  await updateRosterStudent(owner, fx.cred, { name: `${tag}-cred-renamed` });
  const renamed = await userRow(fx.cred);
  assert(renamed.name === `${tag}-cred-renamed` && renamed.email === before.email, "name changed, login email untouched");

  console.log("\n[3] a walk-in shell still gets its login details filled in, and it is audited");
  const shellEmail = `${tag}-shell@x.io`;
  await updateRosterStudent(owner, fx.shell, { email: shellEmail, phone: "+201000000003" });
  const shellAfter = await userRow(fx.shell);
  assert(shellAfter.email === shellEmail && shellAfter.phone === "+201000000003", "the shell's email and phone were set by the counter");
  const audit = await withPlatformContext((tx) =>
    tx.auditLog.findFirst({ where: { action: "center.roster_student_identity_changed", targetId: fx.shell }, select: { actorId: true, centerId: true, beforeState: true, afterState: true } }),
  );
  assert(audit?.actorId === fx.owner && audit.centerId === fx.center, "an audit row names the actor and the centre");
  const bs = (audit?.beforeState ?? {}) as { email?: string | null; phone?: string | null };
  const as = (audit?.afterState ?? {}) as { email?: string | null; phone?: string | null };
  assert(bs.email === null && as.email === shellEmail && bs.phone === "+201000000002" && as.phone === "+201000000003", "…with before/after email and phone");

  console.log("\n[4] the attacker's address matches nobody, so no reset can be requested for it");
  const hit = await withPlatformContext((tx) => tx.user.findFirst({ where: { email: attackerEmail }, select: { id: true } }));
  assert(hit === null, "no users row carries the attacker's email");

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
