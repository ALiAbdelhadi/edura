// SECURITY_AUDIT.md L-04 — acceptInvite claims the token with a conditional
// update FIRST, so two concurrent accepts resolve to exactly one.
import { withPlatformContext } from "@repo/database";
import { acceptInvite } from "@/lib/services/auth/invite-accept";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "l04-" + rid(); __sweepTag = tag;
  const email = `${tag}-invitee@x.io`;
  const token = generateOpaqueToken();
  await withPlatformContext(async (tx) => {
    await tx.user.create({ data: { name: `${tag}-invitee`, role: "teacher", email, status: "pending", passwordHash: null } });
    await tx.inviteToken.create({ data: { email, tokenHash: hashToken(token), purpose: "teacher_invite" as never, expiresAt: new Date(Date.now() + 3600_000) } });
  });

  console.log("\n[1] two concurrent accepts of one invite token");
  const results = await Promise.allSettled([acceptInvite(token, "Str0ngPassw0rd"), acceptInvite(token, "Str0ngPassw0rd")]);
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  assert(okCount === 1, `exactly one accept succeeds (got ${okCount})`);
  const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  assert(!!loser && /already used|Invalid or expired/.test((loser.reason as Error).message), `the other is told the token is used (${(loser?.reason as Error)?.message})`);
  const row = await withPlatformContext((tx) => tx.inviteToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { usedAt: true } }));
  assert(row?.usedAt !== null, "the token is marked used");
  const replay = await acceptInvite(token, "Str0ngPassw0rd").then(() => null).catch((e: Error) => e);
  assert(replay !== null && /already used/.test(replay.message), "a later replay is refused too");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: "suite l04-invite-accept-race.test.ts" });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
