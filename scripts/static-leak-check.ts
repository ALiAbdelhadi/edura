import fs from "node:fs";
import path from "node:path";

const app = process.argv[2] ?? "apps/erp";
const root = path.resolve(import.meta.dirname, "..", app, ".next", "server", "app");

if (!fs.existsSync(root)) {
  console.error(`No prerendered output at ${root}. Run the build first.`);
  process.exit(1);
}

const SENTINELS: { name: string; re: RegExp }[] = [
  { name: "session cookie", re: /edura[\w.-]*\.session_token/ },
  { name: "session token value", re: /"(sessionToken|session_token)"\s*:\s*"[^"]+"/ },
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
