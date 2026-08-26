/* Static-leak check — gate 2 of the Phase 3 rendering proofs.
   ══════════════════════════════════════════════════════════════════════════════

   A prerendered page is written ONCE at build time and served to everybody. So
   the question this asks is narrow and absolute: does any file Next wrote to
   `.next/server/app/**` contain something that belongs to one person?

   Run it after any batch that flips a route from ƒ to ○ or ●:

     bun run --filter edura build:light
     bun run scripts/static-leak-check.ts apps/erp

   THE SENTINELS ARE NOT A GUESS AT WHAT MIGHT LEAK. Each one is a string that
   can only appear in prerendered output if a per-request read happened during
   the build:

     • the session cookie name — proof the auth layer touched the render
     • wallet / balance / EGP amount markers — the money surfaces
     • the seeded demo logins the dev database carries
     • an email or Egyptian phone shape — any real person's contact details
     • student-code and token shapes

   A HIT IS NOT AUTOMATICALLY A LEAK, and the script says so rather than pretending
   otherwise: a marketing page may legitimately contain the word "wallet", and the
   login page contains its own quick-login emails in development builds. The rule
   is that every hit must be explained before a batch ships. Zero hits means
   nothing to explain.
*/

import fs from "node:fs";
import path from "node:path";

const app = process.argv[2] ?? "apps/erp";
const root = path.resolve(import.meta.dirname, "..", app, ".next", "server", "app");

if (!fs.existsSync(root)) {
  console.error(`No prerendered output at ${root}. Run the build first.`);
  process.exit(1);
}

/* THE SENTINELS MATCH VALUES, NOT FIELD NAMES — and the first draft of this file
   did not, which made it useless in an instructive way.

   Every prerendered RSC payload carries the serialized i18n dictionary, so
   `"availableBalance":` appears in all 589 of them — as
   `"availableBalance":"Available to withdraw"`, a translation, and
   `"emailPlaceholder":"you@example.com"`, a form placeholder. The first run
   reported 674 hits and every one was a dictionary entry.

   So a money sentinel requires a NUMBER after the colon, and the email sentinel
   excludes the placeholder domains. A key name with a string after it is copy;
   a key name with a number after it is somebody's balance. */
const SENTINELS: { name: string; re: RegExp }[] = [
  { name: "session cookie", re: /edura[\w.-]*\.session_token/ },
  { name: "session token value", re: /"(sessionToken|session_token)"\s*:\s*"[^"]+"/ },
  // Subdomain alternation is not decoration: the seeded student logins are
  // `@student.nile-academy.eg`, which a bare `@nile-academy.eg` does not match.
  // Found by running this checker against a synthetic leak rather than trusting it.
  { name: "seeded demo login", re: /@(?:[\w-]+\.)?nile-academy\.eg/ },
  {
    name: "real email address",
    re: /[\w.+-]+@(?!example\.(?:com|org|net)|test\.|localhost)[\w-]+\.[\w.]{2,}/,
  },
  { name: "Egyptian mobile", re: /\+?20\s?1[0-25]\d{8}/ },
  { name: "wallet balance value", re: /"(walletBalance|availableBalance|balancePiasters)"\s*:\s*-?\d/ },
  { name: "money row value", re: /"(amountPiasters|netAmount|platformFee)"\s*:\s*-?\d/ },
  { name: "student code value", re: /"studentCode"\s*:\s*"[^"]+"/ },
  { name: "impersonation marker", re: /"impersonatedBy"\s*:\s*"[^"]+"/ },
];

/** Files Next wrote as prerendered output. `.meta`/`.map` are build metadata. */
function collect(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (/\.(html|rsc|body)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = collect(root);
let hits = 0;

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const s of SENTINELS) {
    const m = text.match(s.re);
    if (!m) continue;
    hits++;
    console.log(`HIT  ${s.name}\n     ${path.relative(process.cwd(), f)}\n     ${m[0].slice(0, 120)}`);
  }
}

console.log(
  `\n${files.length} prerendered files scanned, ${SENTINELS.length} sentinels, ${hits} hit${hits === 1 ? "" : "s"}.`,
);
if (hits > 0) {
  console.log("Every hit must be explained before the batch ships.");
  process.exit(1);
}
