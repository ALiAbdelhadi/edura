import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { asArray } from "@/lib/refine/as-array";
import { asData, asRecord } from "@/lib/refine/as-record";
import { baseMessages } from "@/lib/i18n/scope";
import { getMessages, LOCALES } from "@/lib/i18n";

const REFINE_EMPTY_PAYLOAD = Object.freeze({});

describe("asArray — useCustom payloads", () => {
  it("returns [] for refine's frozen empty-object payload (the crash)", () => {
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

const APP = path.join(__dirname, "..", "..", "src", "app", "[locale]");
const BOUNDARY_KEYS = {
  "error.tsx": ["errorTitle", "errorBody", "errorRetry"],
  "not-found.tsx": ["notFoundTitle", "notFoundBody", "notFoundHome"],
} as const;

describe("error + not-found boundaries", () => {
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

describe("asRecord — useCustom payloads", () => {
  it("returns undefined for refine's frozen empty-object payload (the dead guard)", () => {
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

const GUARDED_SCREENS = [
  ["features/admin/admin-reports-screen.tsx", "data"],
  ["features/student/student-dashboard.tsx", "payload"],
  ["features/teacher/teacher-dashboard.tsx", "payload"],
] as const;

describe("loading/error guards key on the payload, not on query flags", () => {
  it.each(GUARDED_SCREENS)("%s guards on `%s`", (file, derived) => {
    const src = readFileSync(path.join(__dirname, "..", "..", "src", file), "utf8");

    expect(src, `${file} should derive its payload with asRecord`).toMatch(
      new RegExp(`const ${derived} = asRecord`),
    );

    expect(src, `${file} needs an early return on !${derived}`).toMatch(
      new RegExp(`if \\(!${derived}\\)`),
    );

    const guards = src.match(/if \([^)]*\)/g) ?? [];
    for (const guard of guards) {
      expect(guard, `${file}: guard keyed on isLoading`).not.toMatch(/isLoading/);
      expect(guard, `${file}: guard reads the raw sentinel`).not.toMatch(
        /!\w*[Rr]es(ult)?\?\.data/,
      );
    }
  });
});

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
