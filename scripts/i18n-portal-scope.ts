// Which translation namespaces can each ERP portal actually render?
//
//   bun run scripts/i18n-portal-scope.ts            # table: portal -> namespaces, bytes
//   bun run scripts/i18n-portal-scope.ts --json
//
// WHY THIS EXISTS. `dashboard/layout.tsx` used to hand the ENTIRE dictionary
// (192 KB, all portals + the marketing site) to every dashboard page. Measured
// 2026-09-20 (docs/reports/load-test-2026-09-20.md §4.2): that one prop is 211 KB
// of a 330 KB page and ~17% of the CPU a page render costs. Each portal now gets
// the base namespaces plus the ones in `apps/erp/src/lib/i18n/portal-namespaces.ts`.
//
// A namespace missing from that list does not throw -- it puts a raw key
// ("teacher.attendance.title") on an operator's screen. So the list is not
// trusted: `apps/erp/tests/unit/i18n-portal-scope.test.ts` recomputes, from the
// import graph, every namespace a portal's code can reach and fails if the
// declared list does not cover it.
//
// The analysis is deliberately GENEROUS in the "include" direction, for the same
// reason scripts/i18n-dead-keys.ts is: a false "used" costs a few KB, a false
// "unused" costs a broken screen. A namespace counts as used by a file if the
// file names it in `useTranslations("ns")` / `getTranslations(...)` /
// `namespace="ns"`, or contains ANY string or template literal that starts with
// `ns.` -- whether or not that literal is ever passed to `t()`.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps/erp");
const SRC = path.join(APP, "src");
const DASHBOARD = path.join(SRC, "app/[locale]/dashboard");

export const PORTALS = ["admin", "staff", "teacher", "assistant", "student", "parent"] as const;
export type Portal = (typeof PORTALS)[number];

type Dict = Record<string, unknown>;

// The merged dictionary, assembled the way src/lib/i18n/index.ts assembles it
// (same reader as scripts/i18n-dead-keys.ts: mounted vs spread files differ).
export function loadDict(locale: "en" | "ar"): Dict {
  const loader = fs.readFileSync(path.join(SRC, "lib/i18n/index.ts"), "utf8");
  const fileOf = new Map<string, string>();
  for (const m of loader.matchAll(/import\s+(\w+)\s+from\s+"@\/messages\/([^"]+)";/g)) {
    fileOf.set(m[1]!, m[2]!);
  }
  const merged = loader.match(new RegExp(`const ${locale}Merged\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!merged) throw new Error(`no ${locale}Merged object in the i18n loader`);
  const read = (ident: string): Dict =>
    JSON.parse(fs.readFileSync(path.join(SRC, "messages", fileOf.get(ident)!), "utf8"));
  const out: Dict = {};
  for (const line of merged[1]!.split("\n")) {
    const spread = line.match(/^\s*\.\.\.(\w+),/);
    if (spread) Object.assign(out, read(spread[1]!));
    const mount = line.match(/^\s*(\w+):\s*(\w+),/);
    if (mount) out[mount[1]!] = read(mount[2]!);
  }
  return out;
}

export function baseNamespaces(): string[] {
  return Object.keys(JSON.parse(fs.readFileSync(path.join(SRC, "messages/en.json"), "utf8")));
}

// ------------------------------------------------------------- import graph
const EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

function resolveFile(base: string): string | null {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) {
    const idx = path.join(base, "index" + e);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

const exportsCache = new Map<string, Record<string, unknown>>();
function exportTarget(pkg: string, subpath: string): string | null {
  if (!exportsCache.has(pkg)) {
    const file = path.join(pkg, "package.json");
    exportsCache.set(pkg, fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")).exports ?? {}) : {});
  }
  const entry = exportsCache.get(pkg)![subpath];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const e = entry as Record<string, unknown>;
    const hit = e.default ?? e.import ?? e.types;
    return typeof hit === "string" ? hit : null;
  }
  return null;
}

function resolveImport(spec: string, from: string): string | null {
  if (spec.startsWith("@/")) return resolveFile(path.join(SRC, spec.slice(2)));
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(from), spec));
  const ws = spec.match(/^@repo\/([^/]+)(?:\/(.*))?$/);
  if (ws) {
    const pkg = path.join(ROOT, "packages", ws[1]!);
    const viaExports = exportTarget(pkg, ws[2] ? `./${ws[2]}` : ".");
    return (
      (viaExports && resolveFile(path.join(pkg, viaExports))) ??
      resolveFile(path.join(pkg, "src", ws[2] ?? "index")) ??
      resolveFile(path.join(pkg, ws[2] ?? "index"))
    );
  }
  return null; // a real npm dependency: carries no Edura translation keys
}

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

// Who first pulled each file in -- so `--trace` can print the import chain.
const importedBy = new Map<string, string>();

function reachable(entries: string[]): { files: Set<string>; unresolved: Set<string> } {
  const files = new Set<string>();
  const unresolved = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    if (!/\.(tsx?|jsx?|mjs)$/.test(f)) continue;
    // `import type … from` / `export type … from` are erased by the compiler: the
    // target module is never loaded, so nothing in it can render. Following them
    // pulled the server-only database package into every portal, whose audit
    // action names ("teacher.updated") then read as translation keys. A mixed
    // `import { type A, b }` is NOT erased and is still followed.
    const text = fs
      .readFileSync(f, "utf8")
      .replace(/(?:import|export)\s+type\s[^'"`;]*?from\s*["'][^"']+["'];?/g, "");
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4]!;
      const hit = resolveImport(spec, f);
      if (hit) {
        if (!importedBy.has(hit) && !files.has(hit)) importedBy.set(hit, f);
        queue.push(hit);
      }
      else if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("@repo/")) {
        if (!/\.(css|json|svg|png|jpg|webp|mdx?)$/.test(spec)) unresolved.add(`${spec}  <- ${path.relative(ROOT, f)}`);
      }
    }
  }
  return { files, unresolved };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

function isClientEntry(file: string): boolean {
  if (!/\.(tsx?|jsx?)$/.test(file)) return false;
  const head = fs.readFileSync(file, "utf8").slice(0, 400);
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(head);
}

// ------------------------------------------------------------------ usage
function namespacesUsedBy(file: string, candidates: string[]): Set<string> {
  // The list file names every namespace (and quotes one in a comment); it renders
  // nothing, so counting it would make every portal "use" whatever it mentions.
  if (file.endsWith(path.join("lib", "i18n", "portal-namespaces.ts"))) return new Set();
  const text = fs.readFileSync(file, "utf8");
  const used = new Set<string>();
  const named = new Set<string>();
  for (const m of text.matchAll(/(?:useTranslations|getTranslations)\(\s*["'`]([\w.]+)["'`]/g)) named.add(m[1]!);
  for (const m of text.matchAll(/namespace\s*[:=]\s*\{?\s*["'`]([\w.]+)["'`]/g)) named.add(m[1]!);
  for (const n of named) used.add(n.split(".")[0]!);
  for (const ns of candidates) {
    if (used.has(ns)) continue;
    // any literal or template head beginning `ns.`
    if (new RegExp(`["'\`]${ns}\\.[\\w$]`).test(text)) used.add(ns);
  }
  return new Set([...used].filter((n) => candidates.includes(n)));
}

export type PortalScope = { namespaces: string[]; files: number; unresolved: string[] };

export function computePortalScopes(): Record<Portal, PortalScope> {
  const base = new Set(baseNamespaces());
  const candidates = Object.keys(loadDict("en")).filter((k) => !base.has(k));
  // Everything a portal page can pull in: its own route tree plus the dashboard
  // layout/loading files that wrap every portal.
  const shared = fs
    .readdirSync(DASHBOARD, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|jsx?)$/.test(e.name))
    .map((e) => path.join(DASHBOARD, e.name));
  const out = {} as Record<Portal, PortalScope>;
  for (const portal of PORTALS) {
    const { files, unresolved } = reachable([...walk(path.join(DASHBOARD, portal)), ...shared]);
    // Only the CLIENT graph reads the scoped provider. A server component's
    // `getTranslations` / `useTranslations` resolves against the full dictionary
    // on the server (src/i18n/request.ts), whatever the client was sent. So: find
    // every reachable file that declares "use client", and count what THOSE and
    // their imports use. A shared file with no directive is counted exactly when
    // some client file imports it -- which is exactly when it ships to the browser.
    const clientEntries = [...files].filter(isClientEntry);
    const client = reachable(clientEntries).files;
    const used = new Set<string>();
    for (const f of client) for (const ns of namespacesUsedBy(f, candidates)) used.add(ns);
    out[portal] = { namespaces: [...used].sort(), files: client.size, unresolved: [...unresolved] };
  }
  return out;
}

if (import.meta.main && !process.argv.includes("--why") && !process.argv.includes("--trace")) {
  const scopes = computePortalScopes();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(Object.fromEntries(PORTALS.map((p) => [p, scopes[p].namespaces])), null, 2));
  } else {
    const ar = loadDict("ar");
    const size = (keys: string[]) => keys.reduce((n, k) => n + JSON.stringify(ar[k] ?? "").length, 0);
    const base = baseNamespaces();
    const all = Object.keys(ar);
    console.log(`whole dictionary (ar): ${size(all)} chars in ${all.length} namespaces; base: ${size(base)} chars\n`);
    for (const p of PORTALS) {
      const s = scopes[p];
      console.log(`${p.padEnd(10)} ${String(size([...base, ...s.namespaces])).padStart(7)} chars  ${s.files} files  +${s.namespaces.length}: ${s.namespaces.join(", ")}`);
      if (s.unresolved.length) console.log(`           UNRESOLVED imports (${s.unresolved.length}): ${s.unresolved.slice(0, 5).join(" | ")}`);
    }
  }
}

// `--why <portal> <namespace>`: which reachable files pull a namespace in.
if (import.meta.main && process.argv.includes("--why")) {
  const i = process.argv.indexOf("--why");
  const portal = process.argv[i + 1] as Portal;
  const ns = process.argv[i + 2]!;
  const shared = fs.readdirSync(DASHBOARD, { withFileTypes: true }).filter((e) => e.isFile() && /\.(tsx?|jsx?)$/.test(e.name)).map((e) => path.join(DASHBOARD, e.name));
  const all = reachable([...walk(path.join(DASHBOARD, portal)), ...shared]).files;
  const { files } = reachable([...all].filter(isClientEntry));
  for (const f of files) if (namespacesUsedBy(f, [ns]).has(ns)) console.log("  ", path.relative(ROOT, f));
}

// `--trace <portal> <path-fragment>`: the import chain that makes a file reachable.
if (import.meta.main && process.argv.includes("--trace")) {
  const i = process.argv.indexOf("--trace");
  const portal = process.argv[i + 1] as Portal;
  const frag = process.argv[i + 2]!;
  const shared = fs.readdirSync(DASHBOARD, { withFileTypes: true }).filter((e) => e.isFile() && /\.(tsx?|jsx?)$/.test(e.name)).map((e) => path.join(DASHBOARD, e.name));
  importedBy.clear();
  const { files } = reachable([...walk(path.join(DASHBOARD, portal)), ...shared]);
  let cur = [...files].find((f) => f.includes(frag));
  while (cur) {
    console.log("  ", path.relative(ROOT, cur));
    cur = importedBy.get(cur);
  }
}
