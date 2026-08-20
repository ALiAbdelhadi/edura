/* eslint-disable no-console */
/**
 * Derives the "must never appear in a marketing image" list FROM THE DATABASE.
 *
 * The capture specs started with four hand-typed strings, and that was too
 * narrow: this dev database also carries a second real person (a Gmail address
 * and a live Egyptian mobile on a student account) plus a set of accounts with
 * real-looking phone numbers. A hand-maintained list cannot know about a row
 * somebody added last week; a generated one can.
 *
 * Every non-demo user contributes its email, its name and its phone — in both
 * the typed and the E.164 form, because the app normalises `01…` to `+201…`
 * and a check against only one of them is a check that passes by luck.
 *
 * Terms shorter than 6 characters are dropped: they collide with ordinary
 * interface text and would fail every capture for no reason.
 *
 * Usage, from the repo root:
 *   bun --env-file=packages/database/.env \
 *     apps/erp/tools/system-shots/build-forbidden.ts
 */
import fs from "node:fs";
import path from "node:path";
import { prisma, withPlatformContext } from "@repo/database";

const OUT = path.join(import.meta.dir, "forbidden.json");

async function main() {
  const { rows, demoNames } = await withPlatformContext(async (tx) => ({
    rows: await tx.user.findMany({
      where: { isDemo: false },
      select: { email: true, name: true, phone: true },
    }),
    demoNames: (
      await tx.user.findMany({ where: { isDemo: true }, select: { name: true } })
    ).map((u) => (u.name ?? "").trim().toLowerCase()),
  }));

  const terms = new Set<string>();
  const add = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    if (s.length >= 6) terms.add(s.toLowerCase());
  };

  for (const r of rows) {
    // EMAIL AND PHONE ALWAYS. They identify one person and collide with
    // nothing, so a hit is always a real finding.
    add(r.email);
    add(r.phone);
    // Both phone shapes: the counter types 01…, the row stores +201….
    if (r.phone?.startsWith("+20")) add("0" + r.phone.slice(3));
    if (r.phone?.startsWith("0")) add("+20" + r.phone.slice(1));

    // NAMES ONLY WHEN THEY ARE NOT SHARED WITH A DEMO ACCOUNT.
    //
    // Names are weak identifiers and Egyptian family names repeat. A non-demo
    // fixture called "أحمد الشناوي" and the counter demo's teacher
    // "أ. أحمد الشناوي" are different accounts with overlapping names, and
    // forbidding the string failed a capture over a demo teacher who is
    // supposed to be on screen. Substring in EITHER direction counts as shared,
    // because one is a prefix of the other exactly as often as not.
    const name = (r.name ?? "").trim().toLowerCase();
    if (name.length >= 6) {
      const shared = demoNames.some((d) => d.length >= 6 && (d.includes(name) || name.includes(d)));
      if (!shared) terms.add(name);
    }
  }

  // Generic role labels several real accounts share — they are not identifying
  // and they collide with ordinary page copy.
  for (const generic of ["platform super admin", "platform accountant"]) terms.delete(generic);

  const list = [...terms].sort();
  fs.writeFileSync(OUT, JSON.stringify({ generatedFrom: `${rows.length} non-demo users`, terms: list }, null, 2));
  console.log(`${list.length} forbidden terms from ${rows.length} non-demo users -> forbidden.json`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
