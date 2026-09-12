// Every relative markdown link in the repo's documentation must resolve.
//
// Written 2026-09-12, after a pass that found 156 dangling links: 84 were paths
// written relative to the repo root from inside a `docs/` subfolder (so they had
// never resolved), 54 were the `apps/www` -> `apps/erp` rename, and the rest
// pointed at files that no longer exist. A broken link is silent — nothing
// compiles it and nothing reads it — so it needs its own check.
//
//   bun run check:doc-links
//
// Anchors (`#section`) and line suffixes (`:42`, `:10-20`) are stripped before
// the file is looked up: they are human pointers, not part of the path.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".next", ".turbo", "graphify-out", ".serena",
  // vendored agent skills: their sample paths are illustrative, not links we own
  ".claude"]);
const LINK = /\]\((?!https?:\/\/|mailto:|#)([^)\s]+)\)/g;

function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) markdownFiles(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const root = resolve(import.meta.dirname, "..");
const files = markdownFiles(root);
let checked = 0;
const bad: { file: string; target: string; line: number }[] = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(LINK)) {
    const target = m[1].split("#")[0].replace(/:\d+(-\d+)?$/, "");
    if (!target) continue;
    checked++;
    if (!existsSync(resolve(dirname(file), target))) {
      bad.push({
        file: relative(root, file),
        target: m[1],
        line: text.slice(0, m.index).split("\n").length,
      });
    }
  }
}

console.log(`${files.length} markdown files · ${checked} relative links checked`);
if (bad.length === 0) {
  console.log("all links resolve ✔");
  process.exit(0);
}
console.error(`\n${bad.length} dangling link(s):`);
for (const b of bad) console.error(`  ${b.file}:${b.line}  ->  ${b.target}`);
process.exit(1);
