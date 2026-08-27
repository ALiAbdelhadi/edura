/* eslint-disable no-console */

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

      await tx.$executeRaw`DELETE FROM two_factors WHERE user_id = ${id}::uuid`;
      await tx.$executeRaw`UPDATE users SET two_factor_enabled = false WHERE id = ${id}::uuid`;

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
