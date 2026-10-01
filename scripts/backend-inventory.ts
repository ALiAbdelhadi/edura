/**
 * Backend-separation inventory (docs/decisions/backend-separation.md, phase 0).
 *
 * Read-only static scan of apps/erp and apps/superadmin. Writes Markdown tables to
 * docs/architecture/backend-separation/. Re-run after every phase:
 *
 *     bun scripts/backend-inventory.ts
 *
 * Every column is derived from the source text, not from running anything. The
 * side-effect column is a keyword heuristic over the route file and its import
 * specifiers; it can miss an effect reached only transitively through a service.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs/architecture/backend-separation");
const APPS = ["erp", "superadmin"] as const;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(ROOT, p);
const cell = (s: string) => (s ? s.replace(/\|/g, "\\|") : "—");

function routePath(file: string, app: string): string {
  const base = path.join(ROOT, `apps/${app}/src/app`);
  const r = path.dirname(path.relative(base, file)).split(path.sep);
  return "/" + r.filter((s) => !/^\(.*\)$/.test(s)).join("/");
}

function methodsOf(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:const|async\s+function|function)\s+([A-Z]+)\b/g))
    if ((METHODS as readonly string[]).includes(m[1]!)) found.add(m[1]!);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1]!.split(",")) {
      const name = part.split(/\s+as\s+/).pop()!.trim();
      if ((METHODS as readonly string[]).includes(name)) found.add(name);
    }
  return METHODS.filter((m) => found.has(m));
}

function guardsIn(seg: string): string[] {
  const g: string[] = [];
  for (const m of seg.matchAll(/withRole\(\s*(\[[^\]]*\]|"[^"]*"|[A-Z_][A-Z_0-9.]*)/g))
    g.push(`withRole(${m[1]!.replace(/[\s"]/g, "")})`);
  for (const m of seg.matchAll(/requireRole\(([^)]*)\)/g))
    g.push(`requireRole(${m[1]!.replace(/[\s"]/g, "")})`);
  if (/centerStaff\(/.test(seg)) {
    const allow = seg.match(/allow:\s*(\[[^\]]*\]|[A-Z_]+)/);
    g.push(`centerStaff${allow ? `(allow:${allow[1]!.replace(/[\s"]/g, "")})` : ""}`);
  }
  if (/delegatedWithCenter\(/.test(seg)) {
    const staff = seg.match(/staffAllow:\s*(\[[^\]]*\]|[A-Z_]+)/);
    g.push(`delegatedWithCenter${staff ? `(staff:${staff[1]!.replace(/[\s"]/g, "")})` : ""}`);
  } else if (/\bdelegated\(/.test(seg)) {
    const also = seg.match(/alsoRoles:\s*(\[[^\]]*\])/);
    g.push(`delegated${also ? `(+${also[1]!.replace(/[\s"]/g, "")})` : ""}`);
  }
  if (/authorizeCenterActor\(/.test(seg)) {
    const allow = seg.match(/allow:\s*(\[[^\]]*\])/);
    g.push(`authorizeCenterActor${allow ? `(${allow[1]!.replace(/[\s"]/g, "")})` : ""}`);
  }
  if (/\btoActingUser\(/.test(seg)) g.push("toActingUser");
  if (!g.some((x) => x.startsWith("requireRole") || x.startsWith("withRole")) && /requireSession\(/.test(seg))
    g.push("requireSession");
  if (/CRON_SECRET|\bauthorized\(/.test(seg)) g.push("cron-secret");
  if (/INTERNAL_API_SECRET|internalAuth|verifyInternal/.test(seg)) g.push("internal-secret");
  if (/hmac/i.test(seg)) g.push("hmac");
  if (!g.length && /getSession(User)?\(/.test(seg)) g.push("optional-session");
  return [...new Set(g)];
}

type Route = {
  app: string;
  file: string;
  path: string;
  methods: string[];
  tier: Record<string, string>;
  rateLimited: boolean;
  services: string[];
  effects: string[];
  dynamic: string;
};

const EFFECTS: [string, RegExp][] = [
  ["money", /wallet|ledger|payment|paymob|subscription|refund|payout|distribut|settle|revenue|finance|expense|topUp|center-money|walk-in|points/i],
  ["notify", /notif|whatsapp|sendMail|\/mail|mailer|webpush|web-push|\bfcm\b|\/fcm|\bsms\b|\/sms|digest|invite/i],
  ["upload", /formData\(\)|cloudinary|upload/i],
  ["stream", /ReadableStream|text\/event-stream|text\/csv|Content-Disposition|\.pdf/i],
  ["audit", /auditLog|writeAudit|audit\//i],
  ["public-cache", /withPublicCache|invalidatesPublicData|revalidate(Path|Tag)|unstable_cache|"use cache"/],
];

function scanRoutes(app: string): Route[] {
  const files = walk(path.join(ROOT, `apps/${app}/src/app/api`)).filter((f) => f.endsWith("route.ts"));
  return files
    .map((file) => {
      const src = readFileSync(file, "utf8");
      const p = routePath(file, app);
      const methods = methodsOf(src);
      const fileGuards = guardsIn(src);
      const tier: Record<string, string> = {};
      for (const m of methods) {
        const re = new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${m}\\b`);
        const at = src.search(re);
        let g: string[] = [];
        if (at >= 0) {
          const rest = src.slice(at + 1);
          const next = rest.search(/\nexport\s/);
          g = guardsIn(next >= 0 ? rest.slice(0, next) : rest);
        }
        tier[m] = g.length ? g.join(" + ") : fileGuards.length ? `~${fileGuards.join(" + ")}` : "PUBLIC";
      }
      const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
      const services = [
        ...new Set(
          imports
            .filter((i) => /services\/|@repo\/(server-core|notifications|observability)|lib\/(payments|attendance|cloudinary|rooms)/.test(i))
            .map((i) =>
              i
                .replace(/^@\/lib\/services\//, "erp:")
                .replace(/^@repo\/server-core\/services\//, "core:")
                .replace(/^@repo\/server-core\/?/, "core/")
                .replace(/^@\/lib\//, "lib/"),
            ),
        ),
      ];
      const hay = src + "\n" + imports.join("\n") + "\n" + p;
      const effects = EFFECTS.filter(([, re]) => re.test(hay)).map(([k]) => k);
      if (/\/cron\//.test(p)) effects.push("cron");
      if (/webhook|callback|paymob\/(notify|response)/i.test(p)) effects.push("webhook");
      if (/\/internal\//.test(p)) effects.push("internal");
      if (/\/auth\//.test(p)) effects.push("auth");
      const dyn = src.match(/export const (dynamic|runtime|maxDuration)\s*=\s*([^;\n]+)/g) ?? [];
      return {
        app,
        file: rel(file),
        path: p,
        methods,
        tier,
        rateLimited: /withRateLimit|rateLimit\(|enforceRateLimit/.test(src),
        services,
        effects: [...new Set(effects)],
        dynamic: dyn.map((d) => d.replace(/export const /, "")).join(", "),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------

const SERVER_IMPORT = /from\s+"(@\/lib\/services[^"]*|@\/lib\/db[^"]*|@\/lib\/auth[^"]*|@\/lib\/authz[^"]*|@repo\/server-core[^"]*|@repo\/database[^"]*|@repo\/notifications[^"]*)"/g;

function scanServerImports(app: string) {
  const rows: { file: string; imports: string[]; typeOnly: boolean }[] = [];
  const files = walk(path.join(ROOT, `apps/${app}/src`)).filter(
    (f) => !f.includes(`${path.sep}app${path.sep}api${path.sep}`) && !f.includes(`${path.sep}lib${path.sep}`),
  );
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const hits: string[] = [];
    let allType = true;
    for (const m of src.matchAll(SERVER_IMPORT)) {
      hits.push(m[1]!);
      const stmtStart = src.lastIndexOf("import", m.index);
      if (!/import\s+type\b/.test(src.slice(stmtStart, m.index))) allType = false;
    }
    if (hits.length) rows.push({ file: rel(f), imports: [...new Set(hits)], typeOnly: allType });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

function scanEnv(dirs: string[]) {
  const vars = new Map<string, Set<string>>();
  for (const d of dirs)
    for (const f of walk(path.join(ROOT, d))) {
      if (/\/tests?\//.test(f)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[\s*"([A-Z_][A-Z0-9_]*)"\s*\]|Bun\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        const k = (m[1] ?? m[2] ?? m[3])!;
        if (!vars.has(k)) vars.set(k, new Set());
        vars.get(k)!.add(rel(f));
      }
    }
  return vars;
}

const SAME_PROCESS: [string, RegExp][] = [
  ["cookies()", /\bcookies\(\)/],
  ["headers()", /\bheaders\(\)/],
  ["use server", /["']use server["']/],
  ["revalidatePath/Tag", /revalidate(Path|Tag)\(/],
  ["unstable_cache / use cache", /unstable_cache|["']use cache["']|cacheTag\(|cacheLife\(/],
  ["after()", /\bafter\(/],
  ["redirect()/notFound()", /\b(redirect|notFound|permanentRedirect)\(/],
  ["draftMode()", /draftMode\(/],
  ["NextResponse", /NextResponse/],
  ["connection()", /\bconnection\(\)/],
];

function scanSameProcess(app: string) {
  const rows: { file: string; hits: string[] }[] = [];
  for (const f of walk(path.join(ROOT, `apps/${app}/src`))) {
    const src = readFileSync(f, "utf8");
    if (!/from\s+"next\/(headers|cache|server|navigation)"|use server|use cache/.test(src)) continue;
    const hits = SAME_PROCESS.filter(([, re]) => re.test(src)).map(([k]) => k);
    if (hits.length) rows.push({ file: rel(f), hits });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const header = (t: string) =>
  `# ${t}\n\nGenerated by \`bun scripts/backend-inventory.ts\` on ${new Date().toISOString().slice(0, 10)}. Static scan — do not hand-edit.\n\n`;

const summary: string[] = [];
for (const app of APPS) {
  const routes = scanRoutes(app);
  const byEffect = new Map<string, number>();
  const byGuard = new Map<string, number>();
  let handlers = 0;
  for (const r of routes) {
    for (const e of r.effects) byEffect.set(e, (byEffect.get(e) ?? 0) + 1);
    for (const m of r.methods) {
      handlers++;
      const k = r.tier[m]!.replace(/\(.*?\)/g, "").replace(/^~/, "");
      byGuard.set(k, (byGuard.get(k) ?? 0) + 1);
    }
  }
  let md = header(`Route inventory — apps/${app}`);
  md += `${routes.length} route files, ${handlers} method handlers.\n\n`;
  md += `Tier notation: \`~\` = guard found at file level, not inside the export (a shared local handler); \`PUBLIC\` = no guard pattern found — verify by hand.\n\n`;
  md += `| path | methods | tier (per method) | RL | services (direct imports) | side effects | route config |\n|---|---|---|---|---|---|---|\n`;
  for (const r of routes) {
    const tiers = [...new Set(Object.values(r.tier))];
    const t = tiers.length === 1 ? tiers[0]! : r.methods.map((m) => `${m}: ${r.tier[m]}`).join("<br>");
    md += `| \`${r.path}\` | ${r.methods.join(" ")} | ${cell(t)} | ${r.rateLimited ? "✓" : ""} | ${cell(r.services.join(", "))} | ${cell(r.effects.join(", "))} | ${cell(r.dynamic)} |\n`;
  }
  writeFileSync(path.join(OUT, `routes-${app}.md`), md);
  writeFileSync(path.join(OUT, `routes-${app}.json`), JSON.stringify(routes, null, 1));
  summary.push(
    `## apps/${app}\n\n- route files: ${routes.length}; method handlers: ${handlers}\n- guard kinds (per handler): ${[...byGuard].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("; ")}\n- side effects (per route file): ${[...byEffect].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("; ")}\n- rate-limited route files: ${routes.filter((r) => r.rateLimited).length}\n`,
  );

  const imports = scanServerImports(app);
  let im = header(`Server imports outside /api — apps/${app}`);
  im += `Files under apps/${app}/src, excluding src/app/api/** and src/lib/**, that import server-side modules. \`type-only\` = every hit is an \`import type\` (erased at build; not a runtime dependency).\n\n| file | imports | type-only |\n|---|---|---|\n`;
  for (const r of imports) im += `| \`${r.file}\` | ${r.imports.map((i) => `\`${i}\``).join(", ")} | ${r.typeOnly ? "yes" : ""} |\n`;
  writeFileSync(path.join(OUT, `server-imports-${app}.md`), im);
  summary.push(
    `- files outside api/ + lib/ importing server code: ${imports.length} (runtime ${imports.filter((r) => !r.typeOnly).length}, type-only ${imports.filter((r) => r.typeOnly).length}); under src/app: ${imports.filter((r) => r.file.includes("/src/app/")).length}\n`,
  );

  const sp = scanSameProcess(app);
  let s = header(`Same-process assumptions — apps/${app}`);
  s += `Files importing next/headers, next/cache, next/server or next/navigation (or declaring "use server" / "use cache") and which of those APIs they use.\n\n| file | APIs |\n|---|---|\n`;
  for (const r of sp) s += `| \`${r.file}\` | ${r.hits.join(", ")} |\n`;
  writeFileSync(path.join(OUT, `same-process-${app}.md`), s);
}

const envTargets: [string, string[]][] = [
  ["apps/erp", ["apps/erp/src", "apps/erp/next.config.ts", "apps/erp/next.config.mjs"]],
  ["apps/superadmin", ["apps/superadmin/src", "apps/superadmin/next.config.ts", "apps/superadmin/next.config.mjs"]],
  ["packages/server-core", ["packages/server-core/src"]],
  ["packages/database", ["packages/database/src"]],
  ["packages/notifications", ["packages/notifications/src"]],
  ["packages/observability", ["packages/observability/src"]],
  ["packages/client-core", ["packages/client-core/src"]],
  ["apps/realtime", ["apps/realtime/src"]],
];
let env = header("Environment variables read, per app / package");
env += "`process.env.X` / `process.env[\"X\"]` / `Bun.env.X` reads in source (tests excluded). `NEXT_PUBLIC_*` are inlined into the browser bundle at build.\n\n";
for (const [name, dirs] of envTargets) {
  const vars = scanEnv(dirs.filter((d) => {
    try {
      statSync(path.join(ROOT, d));
      return true;
    } catch {
      return false;
    }
  }).flatMap((d) => (statSync(path.join(ROOT, d)).isDirectory() ? [d] : [])));
  for (const d of dirs)
    if (/next\.config/.test(d))
      try {
        const src = readFileSync(path.join(ROOT, d), "utf8");
        for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
          if (!vars.has(m[1]!)) vars.set(m[1]!, new Set());
          vars.get(m[1]!)!.add(d);
        }
      } catch {}
  env += `## ${name} (${vars.size})\n\n| var | files |\n|---|---|\n`;
  for (const [k, files] of [...vars].sort((a, b) => a[0].localeCompare(b[0])))
    env += `| \`${k}\` | ${files.size <= 3 ? [...files].map((f) => `\`${f}\``).join(", ") : `${files.size} files`} |\n`;
  env += "\n";
}
writeFileSync(path.join(OUT, "env-vars.md"), env);
writeFileSync(path.join(OUT, "summary.md"), header("Inventory summary") + summary.join("\n"));
console.log(summary.join("\n"));
