/**
 * Read-only survey: find source modules and public assets nothing references.
 *
 *   bun run survey:dead-files
 *
 * IT DELETES NOTHING, and its output is a list of CANDIDATES — never a verdict.
 * Verify every hit by hand before removing it. What it reports is "no other
 * indexed file contains this basename", which is a much weaker claim than "this
 * file is dead".
 *
 * ── WHY IT IS DELIBERATELY CRUDE ────────────────────────────────────────────
 * It matches on plain basename substring rather than parsing imports, and it
 * stops counting at the first hit. Both choices push it toward OVER-counting
 * references, which means UNDER-reporting dead files. For a tool whose output
 * feeds an irreversible delete, a false negative costs a little disk; a false
 * positive costs someone's work.
 *
 * ── THE FAILURE MODE IT ALREADY HAD, KEPT AS A WARNING ──────────────────────
 * The first run reported all 32 help-centre screenshots as unreferenced. They
 * were not: the help centre is 60 `.mdx` files, and `.mdx` was missing from
 * `textExt`, so none of the referring files were indexed at all. A whole file
 * type absent from that set silently turns everything it references into a
 * deletion candidate. **Before trusting a run, check that every extension that
 * can reference a file is in `textExt`.**
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * • Paths built at runtime (`/help/${slug}-${locale}.webp`) — a template literal
 *   has no basename to match. This is why the assets section needs the most care.
 * • Anything reached by convention rather than import. Next.js route files are
 *   excluded via CONVENTION for that reason; a new framework convention needs
 *   adding there or its files will be reported.
 * • Entry points named only in a `package.json` script, a CI workflow, or a
 *   Dockerfile — those ARE indexed, so they resolve, but only if the naming
 *   matches. Check `package.json` scripts by hand for anything under `scripts/`.
 * • Its own directory: only `apps/` and `packages/` are scanned for candidates,
 *   so nothing in root `scripts/` is ever reported, including this file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".turbo", ".git", "graphify-out", "dist", "build",
  "coverage", "test-results", "playwright-report", ".vercel",
]);

/** Next.js / tooling files reached by convention, never by import. */
const CONVENTION = new Set([
  "page", "layout", "route", "loading", "error", "not-found", "template",
  "default", "global-error", "sitemap", "robots", "opengraph-image", "icon",
  "apple-icon", "manifest", "middleware", "instrumentation",
  "instrumentation-client", "index",
]);

const CONFIG_RE =
  /\.(config|setup|d)\.(ts|tsx|js|mjs|cjs)$|^(next-env|vitest\.config|playwright\.config|tailwind\.config|postcss\.config|eslint\.config)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(ROOT);
const codeExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
// NOTE: .mdx is load-bearing here — the entire help centre is MDX, and omitting
// it made the first run report all 32 help screenshots as unreferenced.
const textExt = new Set([
  ...codeExt, ".json", ".md", ".mdx", ".css", ".html", ".yml", ".yaml", ".sql",
  ".prisma", ".txt", ".svg", ".toml", ".lock", ".sh",
]);

/** Every text file's content, read once. */
const contents = new Map<string, string>();
for (const f of allFiles) {
  if (!textExt.has(extname(f))) continue;
  try {
    const st = statSync(f);
    if (st.size > 2_000_000) continue;
    contents.set(f, readFileSync(f, "utf8"));
  } catch {
    /* unreadable — skip */
  }
}

/** Candidate source modules: real code under a src/ or tools/ dir. */
const candidates = allFiles.filter((f) => {
  const rel = relative(ROOT, f);
  if (!codeExt.has(extname(f))) return false;
  if (!/^(apps|packages)\//.test(rel)) return false;
  if (/\.(test|spec)\.[tj]sx?$/.test(rel)) return false;
  if (CONFIG_RE.test(rel.split("/").pop()!)) return false;
  const base = rel.split("/").pop()!.replace(/\.[tj]sx?$/, "");
  if (CONVENTION.has(base)) return false;
  return true;
});

type Hit = { file: string; base: string; refs: number };
const dead: Hit[] = [];

for (const f of candidates) {
  const rel = relative(ROOT, f);
  const base = rel.split("/").pop()!.replace(/\.[tj]sx?$/, "");
  // A reference is any other text file mentioning this module's basename.
  // Crude on purpose: over-counting means we UNDER-report dead files, which is
  // the safe direction for something whose output is a delete list.
  let refs = 0;
  for (const [other, text] of contents) {
    if (other === f) continue;
    if (text.includes(base)) refs++;
    if (refs > 0) break;
  }
  if (refs === 0) dead.push({ file: rel, base, refs });
}

/** Unreferenced public assets. */
const assets = allFiles.filter((f) => {
  const rel = relative(ROOT, f);
  return /^apps\/[^/]+\/public\//.test(rel);
});
const deadAssets: string[] = [];
for (const a of assets) {
  const rel = relative(ROOT, a);
  const base = rel.split("/").pop()!;
  let found = false;
  for (const [other, text] of contents) {
    if (other === a) continue;
    if (text.includes(base)) {
      found = true;
      break;
    }
  }
  if (!found) deadAssets.push(rel);
}

const fmt = (n: number) => n.toString().padStart(4);
console.log(`\nscanned ${allFiles.length} files · ${contents.size} text files indexed\n`);
console.log(`=== UNREFERENCED SOURCE MODULES (${dead.length} of ${candidates.length}) ===`);
for (const d of dead.sort((a, b) => a.file.localeCompare(b.file))) {
  let lines = 0;
  try {
    lines = readFileSync(join(ROOT, d.file), "utf8").split("\n").length;
  } catch {
    /* ignore */
  }
  console.log(`${fmt(lines)} loc  ${d.file}`);
}
console.log(`\n=== UNREFERENCED PUBLIC ASSETS (${deadAssets.length} of ${assets.length}) ===`);
for (const a of deadAssets.sort()) {
  let kb = 0;
  try {
    kb = Math.round(statSync(join(ROOT, a)).size / 1024);
  } catch {
    /* ignore */
  }
  console.log(`${fmt(kb)} KB   ${a}`);
}
console.log();
