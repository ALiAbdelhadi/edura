import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";

const SRC = join(__dirname, "../../src");

// A freshness preset lets a query answer from React Query's cache instead of
// asking the server. Three rules decide where that is allowed, and all three are
// enforced here rather than promised in review.
//
// 1. NEVER on data that must not be stale. CLAUDE.md is binding on money, wallet
//    balances, subscriptions, attendance, sessions, messaging and notifications.
// 2. `reference` and `discovery` are for data that is not per-user at all, so
//    they carry their own narrow allowlist.
// 3. THE REFETCH INVARIANT: a cached query on a screen that can CHANGE that data
//    must be refreshed by that screen. Otherwise the reader acts, and the list
//    they are looking at keeps showing the world before their action.
//
// Rule 3 is the one that makes this file worth having. The others state a policy;
// this one catches a regression nobody would think to look for — adding a
// mutation, months later, to a screen whose list was read-only when its preset
// was granted.
const PUBLIC_ONLY_PREFIXES = ["catalog/", "search/", "centers/"];

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
];

// What a file WRITES, by resource, and by whether that write REFRESHES the list
// on its own.
//
// "This file contains a mutation" is too coarse to decide anything: the
// collaboration panel searches centres and then creates a collaboration REQUEST,
// which changes nothing about the centres it listed. What matters is whether the
// screen writes the same resource it is caching.
//
// And a write through Refine's own mutation hooks already invalidates that
// resource's list — measured in @refinedev/core 5.0.12, `useCreate` defaults to
// invalidates ["list", "many"], `useUpdate` to ["list", "many", "detail"] and
// `useDelete` to ["list", "many"]. Those writes are safe with a staleTime by
// construction. It is the raw ones — `useCustomMutation` and a bare ky call —
// that refresh nothing, and they are what this invariant is actually about.
//
// A write it cannot attribute to a resource counts as writing EVERYTHING, so an
// unreadable mutation makes the invariant stricter, never weaker.
const WRITE_METHOD = /method\s*:\s*["'](post|patch|put|delete)["']/gi;
const KY_WRITE = /\.(?:post|patch|put|delete)\(\s*[`"']([^`"']+)/g;
const REFINE_MUTATION = /use(?:Create|Update|Delete)(?:Many)?\(\s*\{/g;

type Writes = { manual: Set<string>; unattributable: boolean };

const segment = (target: string) => target.split(/[/?]/)[0] ?? target;

// Expands from an index to the object literal containing it, then reads its
// url/resource literal.
function enclosingTarget(text: string, at: number): string | null {
  let depth = 0;
  let start = -1;
  for (let i = at; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;
  let end = start + 1;
  depth = 1;
  for (; end < text.length && depth > 0; end++) {
    if (text[end] === "{") depth++;
    else if (text[end] === "}") depth--;
  }
  const block = text.slice(start, end);
  return /\b(?:url|resource)\s*:\s*["'`]([^"'`$]+)/.exec(block)?.[1] ?? null;
}

function writes(text: string): Writes {
  // No early return on "does this file look like it mutates": a `mutate()` handed
  // in as a prop names no hook, and the write is still a write. The evidence is
  // the call shape itself.
  //
  // Resources written through a Refine mutation hook invalidate themselves.
  const auto = new Set<string>();
  for (const m of text.matchAll(REFINE_MUTATION)) {
    const target = enclosingTarget(text, m.index! + m[0].length);
    if (target) auto.add(segment(target));
  }
  // Refine's mutate() also carries the resource at call time.
  for (const m of text.matchAll(/\{\s*resource\s*:\s*["']([^"']+)["'],\s*(?:id|values)/g)) {
    auto.add(segment(m[1]!));
  }

  const manual = new Set<string>();
  let unattributable = false;
  for (const m of text.matchAll(WRITE_METHOD)) {
    const target = enclosingTarget(text, m.index!);
    if (target) manual.add(segment(target));
    else unattributable = true;
  }
  for (const m of text.matchAll(KY_WRITE)) manual.add(segment(m[1]!));

  for (const r of auto) manual.delete(r);
  return { manual, unattributable };
}

type Hook = {
  file: string;
  targets: string[];
  preset: "reference" | "discovery" | "list" | null;
  handles: string[];
  refetched: boolean;
  invalidated: (t: string) => boolean;
  writes: Writes;
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// Matches the argument object of every useList( / useCustom( by counting braces,
// so a nested object inside the call cannot end the block early, and captures the
// destructured `query` handle (including `query: somethingQuery` aliases) so the
// refetch check can be about THIS query rather than about the file.
function hooks(file: string, text: string): Hook[] {
  const found: Hook[] = [];
  const fileWrites = writes(text);
  // `invalidate({ resource: "x" })` is the better refresh than a local refetch:
  // it clears that resource for every component, not just this one.
  const invalidated = (t: string) =>
    new RegExp(`invalidate\\(\\s*\\{[^}]*resource\\s*:\\s*["'\`]${segment(t)}`).test(text);
  const re = /(?:const|let)\s*\{([^}]*)\}\s*=\s*use(?:List|Custom)\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const handles = (m[1] ?? "")
      .split(",")
      .map((part) => part.trim())
      .flatMap((part) => {
        if (part === "query") return ["query"];
        const [key, alias] = part.split(":").map((x) => x.trim());
        return key === "query" && alias ? [alias] : [];
      });

    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    const block = text.slice(m.index, i);

    // In a ternary only the branches are endpoints — `role === "teacher" ? a : b`
    // would otherwise report "teacher" as one. Anything that leaves no literal at
    // all stays unknown and fails the allowlist, which is the safe way round.
    const expr = /\b(?:resource|url)\s*:\s*([^\n]*)/.exec(block)?.[1] ?? "";
    const rhs = expr.includes("?") ? expr.slice(expr.indexOf("?") + 1) : expr;
    const quoted = [...rhs.matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2] ?? "");
    const templated = [...rhs.matchAll(/`([^`]*?)(?:\$\{|`)/g)].map((x) => x[1] ?? "");
    const targets = [...quoted, ...templated].filter((x) => x.length > 0);

    const preset = (/QUERY_FRESHNESS\.(\w+)/.exec(block)?.[1] ?? null) as Hook["preset"];

    found.push({
      file,
      targets,
      preset,
      handles,
      refetched: handles.some((h) => new RegExp(`\\b${h}\\.refetch\\(`).test(text)),
      invalidated,
      writes: fileWrites,
    });
  }
  return found;
}

const all: Hook[] = [];
for (const f of walk(SRC, [])) {
  const text = readFileSync(f, "utf8");
  if (!text.includes("useList(") && !text.includes("useCustom(")) continue;
  all.push(...hooks(relative(SRC, f), text));
}
const cached = all.filter((h) => h.preset !== null);
const label = (h: Hook) => `${h.file} -> ${h.targets.join(" | ") || "<dynamic>"}`;

describe("query freshness presets stay inside their allowlist", () => {
  it("finds the query call sites at all (guards against a dead scanner)", () => {
    expect(all.length).toBeGreaterThan(50);
    expect(cached.length).toBeGreaterThan(0);
    // Non-vacuity: the handle extraction the refetch invariant depends on has to
    // actually resolve somewhere, or that test would pass by finding nothing.
    expect(cached.some((h) => h.handles.length > 0 && h.refetched)).toBe(true);
    expect(all.some((h) => h.writes.manual.size > 0 || h.writes.unattributable)).toBe(true);
  });

  it("never caches money, attendance, sessions, messaging or notifications", () => {
    const leaked = cached
      .filter((h) => h.targets.some((t) => NEVER_CACHED.some((p) => t.includes(p))))
      .map(label);
    expect(leaked).toEqual([]);
  });

  it("keeps reference and discovery on data that is not per-user", () => {
    const offenders = cached
      .filter((h) => h.preset === "reference" || h.preset === "discovery")
      .filter(
        (h) =>
          h.targets.length === 0 ||
          !h.targets.every((t) => PUBLIC_ONLY_PREFIXES.some((p) => t.startsWith(p))),
      )
      .map(label);
    expect(offenders).toEqual([]);
  });

  it("refreshes a cached query on any screen that writes the same resource", () => {
    const stale = cached
      .filter((h) => !h.refetched)
      .filter((h) => {
        // The education catalog is written only by apps/superadmin, so no ERP
        // screen can make its own copy wrong by acting.
        if (h.preset === "reference") return false;
        if (h.writes.unattributable) return true;
        return h.targets.some((t) => h.writes.manual.has(segment(t)) && !h.invalidated(t));
      })
      .map(label);
    expect(stale).toEqual([]);
  });

  it("never lets a preset turn window-focus refetching back on", () => {
    for (const preset of Object.values(QUERY_FRESHNESS)) {
      expect(preset.refetchOnWindowFocus).toBe(false);
      expect(preset.staleTime).toBeGreaterThan(0);
    }
  });
});
