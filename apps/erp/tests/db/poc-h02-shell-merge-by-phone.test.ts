// PoC for SECURITY_AUDIT.md H-02 — public registration merges into a walk-in
// shell by PHONE with no proof of control. NOT RUN by the audit.
//
// Expected TODAY (vulnerable): assert in [2] FAILS — the attacker's new account
// IS the shell (same user id), so the shell's wallet/roster/history are theirs.
import { withPlatformContext } from "@repo/database";
import { registerStudent } from "@/lib/services/auth/register"; // apps/erp alias
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h02-shell-merge-by-phone.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "h02-" + rid(); __sweepTag = tag;
  const victimPhone = "0100" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");

  console.log("\n[1] a centre registers a walk-in child by phone (shell, no password) and tops up their wallet");
  const shell = await withPlatformContext(async (tx) => {
    const u = await tx.user.create({ data: { name: `${tag}-child`, role: "student", phone: victimPhone, status: "shell", email: null } });
    await tx.studentProfile.create({ data: { userId: u.id, fullName: `${tag}-child`, familyLinkCode: `${tag.toUpperCase()}F0`, walletBalance: 25000 } });
    return u;
  });
  assert(shell.status === "shell", "child exists as a shell with 250 EGP in the wallet");

  console.log("\n[2] a stranger registers with the child's phone number and their own email + password");
  // Phase 3 correction: `users.phone` is @unique, so "a new account on the same
  // phone" cannot exist — the fix REFUSES the collision and names the door. A
  // refusal (ConflictError) and a distinct new account are both non-takeover.
  let res: { userId: string } | null = null;
  let refused: Error | null = null;
  try { res = await registerStudent({ email: `${tag}-attacker@x.io`, password: "Attack3rPass", name: "Mallory", phone: victimPhone }); }
  catch (e) { refused = e as Error; }
  assert(refused !== null || (res !== null && res.userId !== shell.id), `registration MUST NOT activate the child's shell in place (${refused ? "refused: " + refused.message.slice(0, 60) : "new account " + res?.userId})`);

  const after = await withPlatformContext((tx) => tx.user.findUniqueOrThrow({ where: { id: shell.id }, select: { status: true, email: true, passwordHash: true } }));
  assert(after.status === "shell" && after.passwordHash === null, "the child's shell is untouched (still shell, no password set by a stranger)");

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

