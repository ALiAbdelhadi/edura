import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const did = seedId("edura-guardianverdemo:");
const PURPOSE = "guardian_email_verification" as const;

type State = "verified" | "unverified" | "edited" | "expired" | "none";

type Kid = {
  key: string;
  name: string;
  guardian: string | null;
  state: State;
};

const KIDS: Kid[] = [
  {
    key: "farida",
    name: "فريدة سامح",
    guardian: "gverdemo-parent-farida@edura.test",
    state: "verified",
  },
  {
    key: "khaled",
    name: "خالد منير",
    guardian: "gverdemo-parent-khaled@edura.test",
    state: "unverified",
  },
  {
    key: "nada",
    name: "ندى إيهاب",
    guardian: "gverdemo-parent-nada-new@edura.test",
    state: "edited",
  },
  {
    key: "tarek",
    name: "طارق عبد الرحمن",
    guardian: "gverdemo-parent-tarek@edura.test",
    state: "expired",
  },
  {
    key: "malak",
    name: "ملك حسن",
    guardian: null,
    state: "none",
  },
];

const OLD_ADDRESS_OF_NADA = "gverdemo-parent-nada-old@edura.test";

const email = (k: Kid) => `gverdemo-${k.key}@edura.test`;
const EMAILS = KIDS.map(email);
const IDS = KIDS.map((k) => did(k.key));

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const verifyLink = (token: string) =>
  `${APP_URL}/ar/guardian/verify?token=${encodeURIComponent(token)}`;

async function purge() {
  console.log("Purging guardian-verification demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${IDS}::uuid[])`;
    const ids = users.map((u) => u.id);
    if (ids.length === 0) {
      console.log("Purged: nothing to remove.");
      return;
    }
    await tx.inviteToken.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    const hardDeleted = await tx.$executeRaw`
      DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;
    console.log("Purged:", { users: hardDeleted, tokens: "removed" });
  });
  console.log("Purged.");
  console.log(
    "NOTE: any `student.guardian_email_verified` audit row you produced by\n" +
      "clicking a link STAYS. `audit_logs` is REVOKEd DELETE for the app role, so\n" +
      "no purge — this one or any other — can remove it. That is the append-only\n" +
      "trail working as designed, not a leak: the row records that an address was\n" +
      "proven at a time, and it names a profile id that no longer resolves.",
  );
}

async function main() {
  await assertNotProduction("guardian-verification-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding guardian-verification demo…");

  const links: { name: string; kind: string; url: string }[] = [];

  await withPlatformContext(async (tx) => {
    for (const kid of KIDS) {
      const id = did(kid.key);

      await tx.user.upsert({
        where: { id },
        update: { name: kid.name, status: "active", isDemo: true, deletedAt: null },
        create: {
          id,
          name: kid.name,
          role: "student",
          email: email(kid),
          passwordHash: hash,
          status: "active",
          locale: "ar",
          isDemo: true,
        },
      });

      const stamp =
        kid.state === "verified"
          ? { guardianEmailVerifiedAt: daysAgo(3), guardianEmailVerifiedValue: kid.guardian }
          : kid.state === "edited"
            ? { guardianEmailVerifiedAt: daysAgo(9), guardianEmailVerifiedValue: OLD_ADDRESS_OF_NADA }
            : { guardianEmailVerifiedAt: null, guardianEmailVerifiedValue: null };

      const guardianFields = {
        guardianEmail: kid.guardian,
        guardianEmailAddedAt: kid.guardian ? daysAgo(20) : null,
        ...stamp,
      };

      await tx.studentProfile.upsert({
        where: { userId: id },
        update: { fullName: kid.name, ...guardianFields },
        create: {
          userId: id,
          fullName: kid.name,
          entityType: "registered",
          familyLinkCode: `GVERDEMO${kid.key.slice(0, 6).toUpperCase()}`,
          ...guardianFields,
        },
      });

      await tx.inviteToken.deleteMany({ where: { userId: id, purpose: PURPOSE } });

      if (kid.state === "unverified" || kid.state === "expired") {
        const token = randomBytes(32).toString("base64url");
        await tx.inviteToken.create({
          data: {
            userId: id,
            email: kid.guardian,
            purpose: PURPOSE,
            tokenHash: hashToken(token),
            expiresAt: kid.state === "expired" ? daysAgo(1) : daysAhead(7),
          },
        });
        links.push({
          name: kid.name,
          kind: kid.state === "expired" ? "EXPIRED — refuses, and says only that" : "live — click to confirm",
          url: verifyLink(token),
        });
      }
    }
  });

  console.log(`
Seeded 5 students, one per state. Password for all of them: ${PASSWORD}

  ✔ ${email(KIDS[0]!)}   verified — the notice is a quiet confirmation
  … ${email(KIDS[1]!)}   guardian address stored, NOT proven
  ⚠ ${email(KIDS[2]!)}     verified, then the address was EDITED → reads unverified
                             (stamp still names ${OLD_ADDRESS_OF_NADA})
  ✕ ${email(KIDS[3]!)}    a link that has expired
  ∅ ${email(KIDS[4]!)}    no guardian address at all — the notice asks for one

THE LINKS (mint-once: only a SHA-256 is stored, so these cannot be recovered
later — re-run the seed for fresh ones):
${links.map((l) => `  ${l.name} — ${l.kind}\n    ${l.url}`).join("\n")}

Worth doing in the preview, in this order:
  1. Open the LIVE link — the page renders INERT and confirms nothing until you
     press the button (a mail scanner following the URL must not burn it).
  2. Press it, then open it again: the second click is refused.
  3. Open the EXPIRED one: the SAME message, word for word. Every failure looks
     identical, so a prober cannot tell which one they hit.
  4. Sign in as ${email(KIDS[0]!)} and edit the guardian address on the
     settings screen — the verified badge disappears the moment it changes.

NOTE: the messaging gate still opens on a guardian address being PRESENT, not
verified (a deliberate decision, 2026-08-09), so none of these students is
locked out of anything by their state here.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
