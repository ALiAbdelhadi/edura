import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".turbo", "graphify-out", "dist", "build",
  "coverage", "test-results", "playwright-report", ".vercel",
  "generated",
]);

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

    for (const m of text.matchAll(/`([^`$\\\n]*)`/g)) {
      if (m[1]) literals.add(m[1]);
    }

    for (const m of text.matchAll(/`([^`\\\n]*?)\$\{/g)) {
      const head = m[1];
      if (!head || !/^[A-Za-z][\w.]*$/.test(head)) continue;
      if (/[._]$/.test(head)) {
        prefixes.add(head);
        continue;
      }
      if (head.length >= 3) prefixes.add(head);
    }

    for (const m of text.matchAll(/\}([._][A-Za-z]\w*)`/g)) {
      if (m[1]) tails.add(m[1]);
    }
  }
  return { literals, prefixes, tails };
}

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
