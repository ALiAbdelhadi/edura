import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { asArray } from "@/lib/refine/as-array";
import { baseMessages } from "@/lib/i18n/scope";
import { getMessages, LOCALES } from "@/lib/i18n";

/**
 * Two bugs that combined into one unreadable failure: the student wallet screen
 * threw a TypeError on first paint, and the error boundary that should have
 * reported it threw MISSING_MESSAGE on top of it. Neither is a typo — each is a
 * wrong assumption that TypeScript could not catch, so each gets a test.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. asArray — the `useCustom` empty-payload shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The EXACT value refine v5 hands over before a request resolves. Reproduced
 * literally (`@refinedev/core@5.0.12`, src/hooks/data/useCustom.ts:117):
 *
 *     const EMPTY_OBJECT = Object.freeze({}) as any;
 *     result: { data: queryResponse.data?.data || EMPTY_OBJECT }
 *
 * If refine ever changes this to an empty ARRAY the helper still passes — it is
 * the call sites that would stop needing it, which is the right direction.
 */
const REFINE_EMPTY_PAYLOAD = Object.freeze({});

describe("asArray — useCustom payloads", () => {
  it("returns [] for refine's frozen empty-object payload (the crash)", () => {
    // The regression in one line: `?? []` does NOT catch this, asArray does.
    expect(REFINE_EMPTY_PAYLOAD ?? []).not.toBeInstanceOf(Array);
    expect(asArray(REFINE_EMPTY_PAYLOAD)).toEqual([]);
  });

  it("returns [] for undefined and null (the states `?? []` did handle)", () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });

  it("passes a real array through untouched", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(asArray(rows)).toBe(rows);
  });

  it("unwraps the { data } and { items } envelopes some endpoints answer with", () => {
    expect(asArray({ data: [1, 2] })).toEqual([1, 2]);
    expect(asArray({ items: [3] })).toEqual([3]);
  });

  it("returns [] rather than throwing for scalars and object payloads", () => {
    for (const v of ["", "text", 0, 7, true, {}, { data: null }, { data: 5 }]) {
      expect(asArray(v)).toEqual([]);
    }
  });

  it("always returns something .filter/.map can be called on", () => {
    for (const v of [REFINE_EMPTY_PAYLOAD, undefined, null, 1, "x", {}, [{ id: 1 }]]) {
      expect(() => asArray(v).filter(Boolean).map((r) => r)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The error/404 boundaries must be able to translate themselves
// ─────────────────────────────────────────────────────────────────────────────

const APP = path.join(__dirname, "..", "..", "src", "app", "[locale]");
const BOUNDARY_KEYS = {
  "error.tsx": ["errorTitle", "errorBody", "errorRetry"],
  "not-found.tsx": ["notFoundTitle", "notFoundBody", "notFoundHome"],
} as const;

describe("error + not-found boundaries", () => {
  /**
   * Both files render as the CHILDREN of [locale]/layout.tsx, whose provider
   * ships `baseMessages()` only. A namespace mounted from a separate file (as
   * `shared` is) reaches the client under dashboard/layout.tsx and nowhere
   * else, so reading one here throws MISSING_MESSAGE — and an error page that
   * throws while reporting an error hides the original failure completely.
   */
  it.each(LOCALES)("resolves every boundary string from baseMessages (%s)", (locale) => {
    const shipped = baseMessages(getMessages(locale)) as Record<string, any>;
    for (const keys of Object.values(BOUNDARY_KEYS)) {
      for (const key of keys) {
        expect(shipped.errorPage?.[key], `${locale}: errorPage.${key}`).toBeTruthy();
      }
    }
  });

  it.each(Object.keys(BOUNDARY_KEYS))("%s reads a namespace the base layout ships", (file) => {
    const src = readFileSync(path.join(APP, file), "utf8");
    const ns = /useTranslations\("([^"]+)"\)/.exec(src)?.[1];
    expect(ns, `${file} should call useTranslations with a namespace`).toBeTruthy();

    const shipped = baseMessages(getMessages("ar")) as Record<string, unknown>;
    expect(Object.keys(shipped), `${file} uses "${ns}", absent from baseMessages`).toContain(ns);
  });
});
