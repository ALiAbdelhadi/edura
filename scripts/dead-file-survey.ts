import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".turbo", ".git", "graphify-out", "dist", "build",
  "coverage", "test-results", "playwright-report", ".vercel",
]);

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
const textExt = new Set([
  ...codeExt, ".json", ".md", ".mdx", ".css", ".html", ".yml", ".yaml", ".sql",
  ".prisma", ".txt", ".svg", ".toml", ".lock", ".sh",
]);

const contents = new Map<string, string>();
for (const f of allFiles) {
  if (!textExt.has(extname(f))) continue;
  try {
    const st = statSync(f);
    if (st.size > 2_000_000) continue;
    contents.set(f, readFileSync(f, "utf8"));
  } catch {
  }
}

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
  let refs = 0;
  for (const [other, text] of contents) {
    if (other === f) continue;
    if (text.includes(base)) refs++;
    if (refs > 0) break;
  }
  if (refs === 0) dead.push({ file: rel, base, refs });
}

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
  }
  console.log(`${fmt(lines)} loc  ${d.file}`);
}
console.log(`\n=== UNREFERENCED PUBLIC ASSETS (${deadAssets.length} of ${assets.length}) ===`);
for (const a of deadAssets.sort()) {
  let kb = 0;
  try {
    kb = Math.round(statSync(join(ROOT, a)).size / 1024);
  } catch {
  }
  console.log(`${fmt(kb)} KB   ${a}`);
}
console.log();
