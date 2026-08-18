/* eslint-disable no-console */
/**
 * Two dev-only back-office accounts, used to VERIFY the guided tours there.
 *
 * WHY A FIXTURE AND NOT A REAL ACCOUNT. The back office requires 2FA on every
 * screen, so walking its tours means enrolling a second factor. Enrolling one
 * on a real operator's login would bind a secret THIS PROCESS holds to THEIR
 * account — so these are separate, disposable, and obviously named.
 *
 * WHY 2FA IS LEFT OFF HERE. better-auth ENCRYPTS the TOTP secret at rest (the
 * stored value is not base32 and cannot be read back), so the plaintext exists
 * for exactly one moment: the response to `two-factor/enable`. The test
 * therefore enrols each run and captures the secret then — which is why this
 * script clears any previous enrolment rather than leaving one behind.
 *
 *   bun run tsx --env-file=.env prisma/backoffice-tour-fixture.ts
 *   bun run tsx --env-file=.env prisma/backoffice-tour-fixture.ts --purge
 *
 * REFUSES to run against production, like every other seed here.
 */

import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const did = seedId("edura-botour:");

const PEOPLE = [
  { key: "sa", email: "botour-super@edura.test", name: "Back-office Tour (super admin)", role: "super_admin" },
  { key: "acct", email: "botour-acct@edura.test", name: "Back-office Tour (accountant)", role: "accountant" },
] as const;

async function purge() {
  await withPlatformContext(async (tx) => {
    for (const p of PEOPLE) {
      const id = did(p.key);
      await tx.$executeRaw`DELETE FROM two_factors WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM auth_sessions WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM auth_accounts WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM user_prefs WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM users WHERE id = ${id}::uuid`;
    }
  });
  console.log("Purged the back-office tour fixtures.");
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(async (tx) => {
    for (const p of PEOPLE) {
      const id = did(p.key);
      await tx.$executeRaw`
        INSERT INTO users (id, email, password_hash, role, name, status, locale, is_demo, created_at, updated_at)
        VALUES (${id}::uuid, ${p.email}, ${passwordHash}, ${p.role}::role, ${p.name}, 'active', 'ar', true, now(), now())
        ON CONFLICT (id) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              status = 'active',
              role = EXCLUDED.role,
              updated_at = now()`;

      /* Start every run UNENROLLED. The secret is encrypted at rest, so the
         test can only learn it by enrolling — and it can only enrol from a
         clean state. */
      await tx.$executeRaw`DELETE FROM two_factors WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`UPDATE users SET two_factor_enabled = false WHERE id = ${id}::uuid`;

      /* And unseen, so the first-run tour actually offers itself. */
      await tx.$executeRaw`
        INSERT INTO user_prefs (user_id, tour_completed, created_at, updated_at)
        VALUES (${id}::uuid, false, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET tour_completed = false, updated_at = now()`;
    }
  });

  console.log(`
Back-office tour fixtures ready (2FA cleared, tour unseen):

  super admin  ${PEOPLE[0].email} / ${PASSWORD}
  accountant   ${PEOPLE[1].email} / ${PASSWORD}

Both are is_demo and disposable. Re-run this before each verification pass —
the TOTP secret is encrypted at rest, so a walk must enrol from scratch.
`);
}

async function main() {
  await assertNotProduction("backoffice-tour-fixture");
  if (PURGE) await purge();
  else await seed();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("backoffice-tour-fixture failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
