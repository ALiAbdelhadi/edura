/* i18n dead-key matcher.
   ══════════════════════════════════════════════════════════════════════════════

   Implements the method proven in docs/reports/cleanup-notes.md §1. Two earlier
   matchers were wrong in OPPOSITE directions and both are worth naming, because
   whoever changes this file will reach for one of them:

     • A LOOSE matcher (bare leaf as a substring) under-reports: `.startTime`
       counts as a use of `studentClass.start`, `Object.entries` as a use of
       `studentClass.entries`.
     • An EXACT matcher (full dotted path only) over-reports catastrophically:
       `useTranslations("studentIdCard")` then `t("title")` means the full path
       `studentIdCard.title` appears NOWHERE, so nearly the whole catalogue looks
       dead. That pass claimed 330 of 527.

   What works — a key is LIVE if ANY of these hold:

     1. ANY SUFFIX of its dotted path appears as a whole quoted string.
        `studentEmulator.screens.myTab` is reached as `t("screens.myTab")` under
        `useTranslations("studentEmulator")`, so all of
        `"studentEmulator.screens.myTab"`, `"screens.myTab"` and `"myTab"` count.
     2. Its namespace is completed at RUNTIME — `` t(`studentWallet.type_${e.type}`) ``
        means no literal `type_topup` exists and those keys are alive. Every
        template literal in source whose head ends at a `.` or `_` before its
        first `${` is harvested as a live prefix, so the list is derived rather
        than hand-enumerated (the previous pass listed them by hand).
     3. It is reached from `.mdx` / `.md` help content, which is scanned as source.

   THE MATCHER'S OUTPUT IS NOT A DELETE LIST. The decisive step in the method is
   running it at TWO commits and diffing: a key is orphaned by a piece of work
   only if it was live before and is dead after. Comparing like with like cancels
   whatever bias remains. Delete nothing this prints without that diff.

   Usage:  bun run scripts/i18n-dead-keys.ts [--json]
*/

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".turbo", "graphify-out", "dist", "build",
  "coverage", "test-results", "playwright-report", ".vercel",
]);

/** Everything a translation key can be named from. `.mdx` is deliberate. */
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mdx", ".md"]);

type App = { name: string; messages: string };

const APPS: App[] = [
  { name: "erp", messages: "apps/erp/src/messages" },
  { name: "superadmin", messages: "apps/superadmin/src/messages" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (SOURCE_EXT.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Every dotted leaf path in a nested message object. */
function flatten(obj: unknown, prefix = "", out: string[] = []): string[] {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) {
    out.push(prefix);
  }
  return out;
}

/**
 * Every whole quoted string in the source, and every runtime template prefix.
 *
 * The literals are collected as WHOLE quoted contents — not substrings — which
 * is what keeps trap 1 shut: `"startTime"` never satisfies `studentClass.start`.
 */
function harvest(files: string[]): { literals: Set<string>; prefixes: Set<string>; tails: Set<string> } {
  const literals = new Set<string>();
  const prefixes = new Set<string>();
  const tails = new Set<string>();

  for (const f of files) {
    let text: string;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }

    for (const m of text.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'/g)) {
      const v = m[1] ?? m[2];
      if (v) literals.add(v);
    }

    // Template literals with no interpolation read as plain literals.
    for (const m of text.matchAll(/`([^`$\\\n]*)`/g)) {
      if (m[1]) literals.add(m[1]);
    }

    // `t(`studentWallet.type_${e.type}`)` → live prefix `studentWallet.type_`.
    // Any head ending at a `.` or `_` qualifies; anything else would be a
    // sentence, not a namespace.
    for (const m of text.matchAll(/`([^`\\\n]*?)\$\{/g)) {
      const head = m[1];
      if (head && /[._]$/.test(head) && /^[A-Za-z][\w.]*[._]$/.test(head)) {
        prefixes.add(head);
      }
    }

    // The mirror image: `` t(asKey(`${stem}_one`)) `` — the VARIABLE is the head
    // and the fixed part is the tail. This is how every plural family in the
    // back office is built (`forms(stem)` returns `_one`/`_two`/`_few`/`_many`),
    // so `oversight.payment_one` and its 13 siblings exist nowhere as literals.
    // Deliberately loose: a harvested tail keeps EVERY key ending in it alive,
    // which can spare a genuinely dead plural key. That is the safe direction
    // for a matcher whose output feeds deletions.
    for (const m of text.matchAll(/\}([._][A-Za-z]\w*)`/g)) {
      if (m[1]) tails.add(m[1]);
    }
  }
  return { literals, prefixes, tails };
}

/** Every suffix of a dotted path: a.b.c → a.b.c, b.c, c */
function suffixes(key: string): string[] {
  const parts = key.split(".");
  return parts.map((_, i) => parts.slice(i).join("."));
}

const asJson = process.argv.includes("--json");
const sourceFiles = [
  ...walk(path.join(ROOT, "apps")),
  ...walk(path.join(ROOT, "packages")),
];
const { literals, prefixes, tails } = harvest(sourceFiles);

const report: Record<string, { total: number; dead: string[] }> = {};

for (const app of APPS) {
  const enPath = path.join(ROOT, app.messages, "en.json");
  const arPath = path.join(ROOT, app.messages, "ar.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
  const ar = JSON.parse(fs.readFileSync(arPath, "utf8"));

  const enKeys = flatten(en);
  const arKeys = new Set(flatten(ar));

  const dead: string[] = [];
  for (const key of enKeys) {
    const parts = suffixes(key);
    const liveByLiteral = parts.some((s) => literals.has(s));
    // The prefix test runs against every SUFFIX too, not just the full path.
    // A runtime prefix is namespace-RELATIVE — `t(asKey(\`confirm_${action}_title\`))`
    // under `useTranslations("adminUsers")` yields the prefix `confirm_`, while
    // the key is `adminUsers.confirm_suspend_title`. Testing the full path alone
    // marks all ten of those dead, which is trap 2 arriving by another road.
    const liveByPrefix = parts.some((s) => [...prefixes].some((p) => s.startsWith(p)));
    const liveByTail = [...tails].some((t) => key.endsWith(t));
    if (!liveByLiteral && !liveByPrefix && !liveByTail) dead.push(key);
  }

  report[app.name] = { total: enKeys.length, dead };

  if (!asJson) {
    const onlyEn = enKeys.filter((k) => !arKeys.has(k));
    const onlyAr = [...arKeys].filter((k) => !enKeys.includes(k));
    console.log(`\n=== ${app.name} — ${enKeys.length} keys, ${dead.length} unreferenced`);
    if (onlyEn.length || onlyAr.length) {
      console.log(`    PARITY GAP: ${onlyEn.length} en-only, ${onlyAr.length} ar-only`);
      [...onlyEn, ...onlyAr].slice(0, 10).forEach((k) => console.log(`      ! ${k}`));
    }
    dead.forEach((k) => console.log(`    ${k}`));
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const total = Object.values(report).reduce((n, r) => n + r.dead.length, 0);
  console.log(
    `\n${total} unreferenced keys across ${APPS.length} apps, from ${sourceFiles.length} source files ` +
      `(${literals.size} distinct quoted literals, ${prefixes.size} runtime prefixes, ${tails.size} runtime tails).`,
  );
  console.log("NOT a delete list — diff this against a second run. See the header.");
}
