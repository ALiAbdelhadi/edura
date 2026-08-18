import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { asArray } from "@/lib/refine/as-array";
import { asData, asRecord } from "@/lib/refine/as-record";
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
   * ONLY error.tsx was actually broken, and the distinction is worth stating
   * because it is the whole mechanism:
   *
   *   error.tsx      "use client" → reads NextIntlClientProvider → the
   *                  `baseMessages()` subset → `shared` absent → MISSING_MESSAGE
   *   not-found.tsx  server component → reads i18n/request.ts → the whole
   *                  merged dictionary → `shared` was always available
   *
   * And error.tsx failed for EVERY error, not just ones outside /dashboard: the
   * boundary replaces the children of [locale]/layout.tsx, so it takes the
   * place of the dashboard segment and the fuller provider mounted with it.
   *
   * The assertions below hold both files to the client-side constraint anyway.
   * That is deliberately stricter than today's reality — it is what keeps the
   * bug from coming back the day not-found.tsx gains "use client".
   */
  it.each(LOCALES)("resolves every boundary string from baseMessages (%s)", (locale) => {
    const shipped = baseMessages(getMessages(locale)) as Record<string, any>;
    for (const keys of Object.values(BOUNDARY_KEYS)) {
      for (const key of keys) {
        expect(shipped.errorPage?.[key], `${locale}: errorPage.${key}`).toBeTruthy();
      }
    }
  });

  // Stricter than required for not-found.tsx (a server component) — see above.
  it.each(Object.keys(BOUNDARY_KEYS))("%s reads a namespace the base layout ships", (file) => {
    const src = readFileSync(path.join(APP, file), "utf8");
    const ns = /useTranslations\("([^"]+)"\)/.exec(src)?.[1];
    expect(ns, `${file} should call useTranslations with a namespace`).toBeTruthy();

    const shipped = baseMessages(getMessages("ar")) as Record<string, unknown>;
    expect(Object.keys(shipped), `${file} uses "${ns}", absent from baseMessages`).toContain(ns);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. asRecord — the same payload read as an OBJECT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `asArray` fixed the sites that CRASHED. These are the sites that stayed
 * silent: `{}` is truthy, so every guard written against the loading state was
 * dead code and the screen rendered its success layout over a payload that did
 * not exist. A failed request showed zeros that read as real figures — wrong in
 * the one direction a reader cannot detect.
 */
describe("asRecord — useCustom payloads", () => {
  it("returns undefined for refine's frozen empty-object payload (the dead guard)", () => {
    // The regression in one line: the sentinel is TRUTHY, so `!payload` never fired.
    expect(REFINE_EMPTY_PAYLOAD).toBeTruthy();
    expect(asRecord(REFINE_EMPTY_PAYLOAD)).toBeUndefined();
    expect(!asRecord(REFINE_EMPTY_PAYLOAD)).toBe(true);
  });

  it("returns undefined for undefined, null, scalars and arrays", () => {
    for (const v of [undefined, null, "", "text", 0, 7, true, [], [{ id: 1 }]]) {
      expect(asRecord(v)).toBeUndefined();
    }
  });

  it("passes a real object payload through untouched", () => {
    const payload = { revenue: 1200, expenses: 300 };
    expect(asRecord(payload)).toBe(payload);
  });

  it("keeps a falsy-valued but present payload — only EMPTINESS means not-loaded", () => {
    expect(asRecord({ revenue: 0 })).toEqual({ revenue: 0 });
  });
});

/**
 * The guard must key on the PAYLOAD, not on `isLoading` / `isError`.
 *
 * React Query pauses a retry when its online-heuristic says the network is
 * down — observed live as `fetchStatus: "paused"`, `status: "pending"`,
 * `isLoading: false`, `isError: false`. In that state BOTH of the original
 * guards were unreachable, so the screen rendered its success layout over a
 * payload that did not exist. On the reports screen that is a money figure:
 * "0.00 EGP" revenue, indistinguishable from a real zero.
 *
 * Deriving with asRecord is necessary but NOT sufficient — it makes the payload
 * honestly null; the guard still has to read it.
 */
const GUARDED_SCREENS = [
  ["features/admin/admin-reports-screen.tsx", "data"],
  ["features/student/student-dashboard.tsx", "payload"],
  ["features/teacher/teacher-dashboard.tsx", "payload"],
] as const;

describe("loading/error guards key on the payload, not on query flags", () => {
  it.each(GUARDED_SCREENS)("%s guards on `%s`", (file, derived) => {
    const src = readFileSync(path.join(__dirname, "..", "..", "src", file), "utf8");

    // The payload must be derived with asRecord — otherwise `{}` reaches it.
    expect(src, `${file} should derive its payload with asRecord`).toMatch(
      new RegExp(`const ${derived} = asRecord`),
    );

    // There must be an early return keyed on the payload being absent.
    expect(src, `${file} needs an early return on !${derived}`).toMatch(
      new RegExp(`if \\(!${derived}\\)`),
    );

    // And no guard may hang off isLoading: it is false while a retry is paused,
    // which is exactly the state that used to slip through.
    const guards = src.match(/if \([^)]*\)/g) ?? [];
    for (const guard of guards) {
      expect(guard, `${file}: guard keyed on isLoading`).not.toMatch(/isLoading/);
      expect(guard, `${file}: guard reads the raw sentinel`).not.toMatch(
        /!\w*[Rr]es(ult)?\?\.data/,
      );
    }
  });
});

/**
 * asRecord REJECTS an array on purpose — at a site that expects one object
 * shape that is a useful assertion. But a generic passthrough must not use it:
 * superadmin's `useAdminGet` is typed `<DeletionRow[]>` at some call sites and
 * `<{ rooms: RoomRow[] }>` at others, and routing a list through asRecord makes
 * a SUCCESSFUL response read as "never loaded" — seventeen oversight tabs
 * rendering permanently empty, with no error anywhere. That regression shipped
 * and was caught by reading the call sites, not by a test. This is the test.
 */
describe("asData — the shape-agnostic variant", () => {
  it("passes a real array through, where asRecord would drop it", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(asRecord(rows)).toBeUndefined(); // correct for asRecord, fatal for a list
    expect(asData(rows)).toBe(rows);
  });

  it("passes an EMPTY array through — a complete answer, not a missing one", () => {
    const empty: unknown[] = [];
    expect(asData(empty)).toBe(empty);
    expect(asData<unknown[]>(empty) ?? ["fallback"]).toEqual([]);
  });

  it("still treats the refine sentinel as not-loaded", () => {
    expect(asData(REFINE_EMPTY_PAYLOAD)).toBeUndefined();
    expect(asData(undefined)).toBeUndefined();
    expect(asData(null)).toBeUndefined();
  });

  it("passes object payloads through untouched", () => {
    const payload = { rooms: [{ id: "r1" }] };
    expect(asData(payload)).toBe(payload);
  });
});
