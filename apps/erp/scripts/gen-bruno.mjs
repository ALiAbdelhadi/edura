#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "src", "app", "api");
const OUT = join(ROOT, "bruno");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

function toUrlPath(file) {
  const rel = file.slice(ROOT.length).replace(/\/route\.ts$/, "").replace(/^\/(src\/)?app\//, "");
  return (
    "/" +
    rel
      .replace(/%5F/gi, "_")
      .split("/")
      .map((s) => (s.startsWith("[") ? ":" + s.replace(/^\[\.\.\./, "").replace(/[[\]]/g, "") : s))
      .join("/")
  );
}

function exportedMethods(src) {
  return METHODS.filter((m) =>
    new RegExp(`export\\s+(?:const|async\\s+function)\\s+${m}\\b`).test(src) ||
    new RegExp(`export\\s+const\\s+${m}\\s*=\\s*(?:GET|POST|PUT|PATCH|DELETE)\\b`).test(src),
  );
}

function braceBody(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "[" || c === "(") { depth++; continue; }
    if (c === "}" || c === "]" || c === ")") { depth--; continue; }
    if (depth !== 0) continue;
    const prev = body[i - 1];
    if (prev && /[\w$.]/.test(prev)) continue;
    const m = /^([a-zA-Z_$][\w$]*)\s*:/.exec(body.slice(i));
    if (!m) continue;
    keys.push(m[1]);
    i += m[0].length - 1;
  }
  return keys;
}

function handlerBlock(src, method) {
  const m = new RegExp(`export\\s+(?:const|async\\s+function)\\s+${method}\\b`).exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\nexport\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

const OBJECT_OPEN = /z\s*\.\s*object\(\s*\{/;

function bodySchemaOpen(src, method) {
  const block = handlerBlock(src, method);
  if (block) {
    const named = [...block.matchAll(/parseJson\s*\([^,]*,\s*([a-zA-Z_$][\w$]*)/g)];
    for (let i = named.length - 1; i >= 0; i--) {
      const decl = new RegExp(
        `(?:const|let|var)\\s+${named[i][1]}\\s*(?::[^=;]*)?=\\s*z\\s*\\.\\s*object\\(\\s*\\{`,
      ).exec(src);
      if (decl) return decl.index + decl[0].length - 1;
    }
    const inline = new RegExp(`parseJson\\s*\\([^,]*,\\s*${OBJECT_OPEN.source}`).exec(block);
    if (inline) return src.indexOf(inline[0]) + inline[0].length - 1;
  }
  const first = OBJECT_OPEN.exec(src);
  return first ? first.index + first[0].length - 1 : null;
}

function bodyStub(src, method) {
  const open = bodySchemaOpen(src, method);
  if (open == null) return null;
  const body = braceBody(src, open);
  if (body == null) return null;
  const keys = topLevelKeys(body);
  if (!keys.length) return null;
  const obj = {};
  for (const k of keys) obj[k] = /^paymentMethod$/.test(k) ? "cash" : /id$/i.test(k) ? "{{" + k + "}}" : /reason|note|comment|title|body|name/i.test(k) ? "" : /amount|price|share|delta|points|score/i.test(k) ? 0 : "";
  return obj;
}

const bru = (s) => s.replace(/\{/g, "{").trimStart();
const indent = (obj) => JSON.stringify(obj, null, 2).split("\n").map((l) => "  " + l).join("\n");

function mergeBody(stub, preserved) {
  if (stub == null) return preserved ?? indent({});
  if (!preserved) return indent(stub);
  let prev;
  try {
    prev = JSON.parse(preserved);
  } catch {
    return indent(stub);
  }
  if (!prev || typeof prev !== "object" || Array.isArray(prev)) return indent(stub);
  const placeholder = (k, v) => v === "" || v === 0 || v === `{{${k}}}`;
  const out = {};
  for (const k of Object.keys(stub)) {
    out[k] = k in prev && !placeholder(k, prev[k]) ? prev[k] : stub[k];
  }
  return indent(out);
}

const PRESERVE = new Set(["README.md", "environments", "bruno.json"]);

const handBodies = new Map();
function snapshotBodies(dir, rel = "") {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const r = rel ? `${rel}/${e}` : e;
    if (statSync(p).isDirectory()) snapshotBodies(p, r);
    else if (e.endsWith(".bru")) {
      const m = readFileSync(p, "utf8").match(/\nbody:json \{\n([\s\S]*?)\n\}/);
      if (m && m[1].trim() && m[1].trim() !== "{}") handBodies.set(r, m[1]);
    }
  }
}
if (existsSync(OUT)) snapshotBodies(OUT);

if (existsSync(OUT)) {
  for (const e of readdirSync(OUT)) {
    if (!PRESERVE.has(e)) rmSync(join(OUT, e), { recursive: true, force: true });
  }
}
mkdirSync(join(OUT, "environments"), { recursive: true });

writeFileSync(
  join(OUT, "bruno.json"),
  JSON.stringify({ version: "1", name: "Edura API", type: "collection", ignore: ["node_modules", ".git"] }, null, 2) + "\n",
);
const localEnv = join(OUT, "environments", "Local.bru");
if (!existsSync(localEnv)) {
  writeFileSync(
    localEnv,
    `vars {\n  baseUrl: http://localhost:3002\n  email: superadmin@edura.eg\n  password: Passw0rd!\n  token: \n}\n`,
  );
}

mkdirSync(join(OUT, "_auth"), { recursive: true });
writeFileSync(
  join(OUT, "_auth", "Login.bru"),
  `meta {
  name: Login
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/auth/sign-in/email
  body: json
  auth: none
}

headers {
  Content-Type: application/json
}

body:json {
  {
    "email": "{{email}}",
    "password": "{{password}}"
  }
}

script:post-response {
  if (res.body && res.body.data && res.body.data.token) {
    bru.setEnvVar("token", res.body.data.token);
  }
}
`,
);

const files = walk(API_DIR).sort();
let count = 0;
const seqByDir = {};
const skipped = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const url = toUrlPath(file);
  if (url.includes("nextauth")) { skipped.push(url + " (next-auth internal)"); continue; }
  const methods = exportedMethods(src);
  if (!methods.length) { skipped.push(url + " (no exported HTTP method)"); continue; }

  const segs = url.replace(/^\/api\//, "").split("/");
  const folder = join(OUT, ...segs.map((s) => s.replace(/^:/, "_")));
  mkdirSync(folder, { recursive: true });

  for (const method of methods) {
    seqByDir[folder] = (seqByDir[folder] || 0) + 1;
    const seq = seqByDir[folder];
    const name = `${method} ${segs[segs.length - 1] || "root"}`;
    const isWrite = method !== "GET" && method !== "DELETE";
    const stub = isWrite ? bodyStub(src, method) : null;
    const relFile = [...segs.map((s) => s.replace(/^:/, "_")), `${method}.bru`].join("/");
    const bodyBlock = isWrite ? `\nbody:json {\n${mergeBody(stub, handBodies.get(relFile))}\n}\n` : "";
    const bodyLine = isWrite ? "\n  body: json" : "";
    const content = `meta {
  name: ${name}
  type: http
  seq: ${seq}
}

${method.toLowerCase()} {
  url: {{baseUrl}}${url}${bodyLine}
  auth: none
}

headers {${isWrite ? "\n  Content-Type: application/json" : ""}
}
${bodyBlock}`;
    writeFileSync(join(folder, `${method}.bru`), bru(content));
    count++;
  }
}

console.log(`Bruno collection written to bruno/`);
console.log(`  ${count} requests across ${files.length} route files`);
console.log(`  skipped ${skipped.length}: ${skipped.join(", ") || "none"}`);
