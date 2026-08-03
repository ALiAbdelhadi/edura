import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { baseMessages } from "@/lib/i18n/scope";
import { getMessages } from "@/lib/i18n";

/**
 * The global error boundary must be able to render its own copy.
 *
 * `app/[locale]/error.tsx` calls `useTranslations("shared")` and can appear on
 * ANY route, including ones whose message scope is deliberately narrow. `shared`
 * is not a top-level key of en.json — it is its own namespace file — so it was
 * absent from `BASE_KEYS` and the boundary rendered raw key paths:
 *
 *     shared.errorTitle
 *     shared.errorBody
 *     shared.errorRetry
 *
 * That is the failure mode this test exists to prevent: copy that is missing
 * only when something has already gone wrong, which is exactly when nobody is
 * looking at the translation layer.
 */

const NAMESPACE_RE = /useTranslations\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

describe("global error boundary i18n scope", () => {
  it("every namespace the error boundary uses survives the base scope", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/app/[locale]/error.tsx"),
      "utf8",
    );

    const namespaces = [...source.matchAll(NAMESPACE_RE)].map((m) => m[1]!);
    expect(namespaces.length, "error.tsx uses no namespace — has it moved?").toBeGreaterThan(0);

    const base = baseMessages(getMessages("en")) as Record<string, unknown>;
    const missing = namespaces.filter((ns) => !(ns in base));

    expect(
      missing,
      `the global error boundary would render raw key paths for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("the keys it actually reads resolve to real strings", () => {
    const base = baseMessages(getMessages("en")) as Record<string, Record<string, unknown>>;
    for (const key of ["errorTitle", "errorBody", "errorRetry"]) {
      expect(typeof base.shared?.[key], `shared.${key} is missing from the base scope`).toBe(
        "string",
      );
    }
  });
});
