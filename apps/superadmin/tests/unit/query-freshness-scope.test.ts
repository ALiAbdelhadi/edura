import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";

const SRC = join(__dirname, "../../src");

// A freshness preset (or any staleTime > 0) lets a query answer from the cache
// instead of the server. CLAUDE.md forbids that for money, wallets, subscriptions,
// payments, payouts, refunds, ledgers, attendance, sessions, messaging,
// notifications and auth/session data. This guard reads EVERY site that grants
// freshness, whatever shape it takes:
//   1. `freshness: QUERY_FRESHNESS.x`        (useListScreen & friends)
//   2. `...QUERY_FRESHNESS.x` / `queryOptions: QUERY_FRESHNESS.x`
//   3. a literal `staleTime: <non-zero>`
// and attributes it to the nearest enclosing object that names a url/resource.
// A site it cannot attribute fails: unreadable never means allowed.
const NEVER_CACHED = [
  "me/",
  "payment",
  "wallet",
  "payout",
  "transaction",
  "invoice",
  "subscription",
  "attendance",
  "checkin",
  "check-in",
  "message",
  "notification",
  "expense",
  "session",
  "counter",
  "shift",
  "refund",
  "credit",
  "ledger",
  "points",
  "revenue",
  "split",
  "per-student-rate",
  "blacklist",
  "whatsapp",
  "impersonat",
  "view-as",
  "prefs",
  "auth",
];

const REFERENCE_ONLY_PREFIXES = ["admin/catalog/"];

type Site = { file: string; kind: string; targets: string[] };

function grants(file: string, text: string): Site[] {
  const out: Site[] = [];
  const re = /QUERY_FRESHNESS\.(\w+)|staleTime\s*:\s*(?!0\b)([^,}\n]+)/g;
  for (const m of text.matchAll(re)) {
    const at = m.index!;
    const lineStart = text.lastIndexOf("\n", at) + 1;
    const line = text.slice(lineStart, text.indexOf("\n", at) === -1 ? undefined : text.indexOf("\n", at));
    if (/^\s*(import|export)\b/.test(line) || /\btypeof\s+QUERY_FRESHNESS/.test(line)) continue;
    out.push({ file, kind: m[1] ? `preset:${m[1]}` : `staleTime:${m[2]!.trim()}`, targets: targetsAround(text, at) });
  }
  return out;
}

// Walks outward through the enclosing `{ }` blocks until one names a url or
// resource, and returns every string literal on that property's line.
function targetsAround(text: string, at: number): string[] {
  let i = at;
  while (i >= 0) {
    let depth = 0;
    let start = -1;
    for (; i >= 0; i--) {
      if (text[i] === "}") depth++;
      else if (text[i] === "{") {
        if (depth === 0) {
          start = i;
          break;
        }
        depth--;
      }
    }
    if (start < 0) return [];
    let end = start + 1;
    let d = 1;
    for (; end < text.length && d > 0; end++) {
      if (text[end] === "{") d++;
      else if (text[end] === "}") d--;
    }
    const block = text.slice(start, end);
    const prop = /\b(?:url|resource)\s*:\s*([^\n]*)/.exec(block);
    if (prop) {
      return [...prop[1]!.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)]
        .map((x) => (x[1] ?? x[2] ?? x[3] ?? "").replace(/\$\{[^}]*\}/g, "*"))
        .filter((x) => x.length > 0);
    }
    i = start - 1;
  }
  return [];
}

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const all: Site[] = [];
for (const f of walk(SRC, [])) {
  all.push(...grants(relative(SRC, f), readFileSync(f, "utf8")));
}
const label = (s: Site) => `${s.file} ${s.kind} -> ${s.targets.join(" | ") || "<unattributed>"}`;
const forbidden = (t: string) => NEVER_CACHED.some((p) => t.includes(p));

describe("superadmin query freshness stays inside its allowlist", () => {
  it("finds the grant sites at all (guards against a dead scanner)", () => {
    expect(all.length).toBeGreaterThan(10);
    expect(all.some((s) => s.kind.startsWith("preset:") && s.targets.length > 0)).toBe(true);
  });

  it("attributes every grant to an endpoint", () => {
    expect(all.filter((s) => s.targets.length === 0).map(label)).toEqual([]);
  });

  it("never caches money, ledgers, sessions, messaging, notifications or prefs", () => {
    expect(all.filter((s) => s.targets.some(forbidden)).map(label)).toEqual([]);
  });

  it("keeps reference on the education catalog only", () => {
    const offenders = all
      .filter((s) => s.kind === "preset:reference" || s.kind === "preset:discovery")
      .filter((s) => !s.targets.every((t) => REFERENCE_ONLY_PREFIXES.some((p) => t.startsWith(p))))
      .map(label);
    expect(offenders).toEqual([]);
  });

  it("keeps every preset under the admin API", () => {
    expect(all.filter((s) => !s.targets.every((t) => t.startsWith("admin/"))).map(label)).toEqual([]);
  });

  it("never lets a preset turn window-focus refetching back on", () => {
    for (const preset of Object.values(QUERY_FRESHNESS)) {
      expect(preset.refetchOnWindowFocus).toBe(false);
      expect(preset.staleTime).toBeGreaterThan(0);
    }
  });
});

describe("the scanner bites on every grant shape", () => {
  const caught = (src: string) => grants("fixture.tsx", src).filter((s) => s.targets.some(forbidden));

  it("hook option: freshness: QUERY_FRESHNESS.x", () => {
    const src = `const l = useCursorListScreen({\n  url: "admin/wallet/entries",\n  freshness: QUERY_FRESHNESS.list,\n});`;
    expect(caught(src)).toHaveLength(1);
  });

  it("spread into queryOptions", () => {
    const src = `useCustom({\n  url: "admin/refunds",\n  method: "get",\n  queryOptions: { ...QUERY_FRESHNESS.list, enabled: open },\n});`;
    expect(caught(src)).toHaveLength(1);
  });

  it("literal staleTime, and the me/prefs key that slipped past before", () => {
    expect(caught(`const q = useCustom({ url: "me/prefs", queryOptions: { staleTime: 30_000 } });`)).toHaveLength(1);
    expect(caught(`const actionsQ = useCustom({ url: "me/prefs", method: "get", queryOptions: QUERY_FRESHNESS.list });`)).toHaveLength(1);
    expect(caught(`useCustom({ url: "admin/audit-logs", queryOptions: { staleTime: 0 } })`)).toHaveLength(0);
  });

  it("ignores imports and type references", () => {
    const src = `import { QUERY_FRESHNESS } from "x";\ntype F = (typeof QUERY_FRESHNESS)[keyof typeof QUERY_FRESHNESS];`;
    expect(grants("f.ts", src)).toEqual([]);
  });
});
