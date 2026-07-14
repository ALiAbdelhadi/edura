#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "app", "api");
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
  const rel = file.slice(ROOT.length).replace(/\/route\.ts$/, "").replace(/^\/app\//, "");
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

function bodyStub(src) {
  const m = src.match(/z\.object\(\{([\s\S]*?)\}\)/);
  if (!m) return null;
  const keys = [...m[1].matchAll(/^\s*([a-zA-Z_][\w]*)\s*:/gm)].map((x) => x[1]);
  if (!keys.length) return null;
  const obj = {};
  for (const k of keys) obj[k] = /id$/i.test(k) ? "{{" + k + "}}" : /reason|note|comment|title|body|name/i.test(k) ? "" : /amount|price|share|delta|points|score/i.test(k) ? 0 : "";
  return obj;
}

const bru = (s) => s.replace(/\{/g, "{").trimStart();
const indent = (obj) => JSON.stringify(obj, null, 2).split("\n").map((l) => "  " + l).join("\n");

const PRESERVE = new Set(["README.md", "environments", "bruno.json"]);
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
  url: {{baseUrl}}/api/v1/auth/login
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
  // Capture the bearer token; the session cookie is stored by Bruno's cookie jar.
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
    const stub = isWrite ? bodyStub(src) : null;
    const bodyBlock =
      isWrite
        ? `\nbody:json {\n${indent(stub ?? {})}\n}\n`
        : "";
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
