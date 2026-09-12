// Reports translation keys that no source file references.
//
// THIS IS NOT A DELETE LIST. A key assembled at runtime — `t(`status.${s}`)`,
// `t(asKey(`${stem}_two`))` — cannot be proven dead from one pass, so the scan
// models two shapes of composition (a literal head before `${`, and a literal
// `.tail` / `_tail` after `}`) and treats anything they could reach as live.
// That is a heuristic, and it is deliberately generous in the live direction:
// a false "dead" costs a raw key on screen in Arabic in front of an operator,
// a false "live" costs one line of JSON. Before deleting anything, confirm by a
// second, independent method — enumerate every template-literal key site in the
// app and check that none could build the candidate.
//
// The dictionaries are NOT one file per locale. Each app has `messages/en.json`
// plus `messages/en/*.json`, and its own `src/lib/i18n/index.ts` decides how
// each split file is mounted — some under a namespace (`teacher: teacherEn`),
// some spread at the root (`...studentEn`). This scanner reads that loader
// rather than guessing from filenames, because guessing was wrong for apps/erp
// and silently hid thirteen namespaces from the scan.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".turbo", "graphify-out", "dist", "build",
  "coverage", "test-results", "playwright-report", ".vercel",
  "generated",
]);

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mdx", ".md"]);

type App = { name: string; dir: string };

const APPS: App[] = [
  { name: "erp", dir: "apps/erp" },
  { name: "superadmin", dir: "apps/superadmin" },
];

type Dict = Record<string, unknown>;

// Rebuilds one locale's dictionary exactly as the app's loader assembles it.
function loadDict(appDir: string, locale: "en" | "ar"): Dict {
  const loader = fs.readFileSync(
    path.join(ROOT, appDir, "src/lib/i18n/index.ts"),
    "utf8",
  );

  const fileOf = new Map<string, string>();
  for (const m of loader.matchAll(/import\s+(\w+)\s+from\s+"@\/messages\/([^"]+)";/g)) {
    fileOf.set(m[1]!, m[2]!);
  }

  const merged = loader.match(
    new RegExp(`const ${locale}Merged\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!merged) throw new Error(`${appDir}: no ${locale}Merged object in the i18n loader`);

  const read = (ident: string): Dict => {
    const rel = fileOf.get(ident);
    if (!rel) throw new Error(`${appDir}: ${ident} is merged but never imported`);
    return JSON.parse(fs.readFileSync(path.join(ROOT, appDir, "src/messages", rel), "utf8"));
  };

  const out: Dict = {};
  for (const line of merged[1]!.split("\n")) {
    const spread = line.match(/^\s*\.\.\.(\w+),/);
    if (spread) {
      Object.assign(out, read(spread[1]!));
      continue;
    }
    const mount = line.match(/^\s*(\w+):\s*(\w+),/);
    if (mount) out[mount[1]!] = read(mount[2]!);
  }
  return out;
}

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
  const en = loadDict(app.dir, "en");
  const ar = loadDict(app.dir, "ar");

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
  console.log("NOT a delete list — confirm independently first. See the header.");
}
