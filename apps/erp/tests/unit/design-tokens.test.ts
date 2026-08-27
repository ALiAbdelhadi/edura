import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");

const GLOBALS = join(REPO, "packages/ui/src/styles/globals.css");

const PORTAL_SHEETS = [
  join(APP, "src/features/admin/ledger/ledger.css"),
  join(APP, "src/components/ledger/ledger.module.css"),
  join(REPO, "packages/ui/src/styles/chrome-2026.css"),
];

const PORTAL_OWNED = new Set([
  "--money", // teal vs indigo money accent, per portal
  "--money-soft",
  "--shadow-glow", // gradients/glow are switched off inside the ledger scopes
  "--primary-glow",
  "--sidebar-width", // 248px, this portal's chrome only
]);

function declaredTokens(file: string): Set<string> {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set<string>();
  for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
    for (const decl of block[1].split(";")) {
      const name = decl.split(":")[0]?.trim();
      if (name?.startsWith("--")) names.add(name);
    }
  }
  return names;
}

describe("the design tokens have a single source of truth", () => {
  const shared = declaredTokens(GLOBALS);

  it("globals.css owns the palette", () => {
    expect(shared.size).toBeGreaterThan(50);
    for (const token of ["--ink-3", "--teal", "--seal", "--secondary", "--chart-1", "--muted"]) {
      expect(shared, `${token} must be defined in packages/ui globals.css`).toContain(token);
    }
  });

  it.each(PORTAL_SHEETS)("%s redeclares no shared token", (sheet) => {
    const offenders = [...declaredTokens(sheet)]
      .filter((t) => shared.has(t) && !PORTAL_OWNED.has(t))
      .sort();

    expect(
      offenders,
      `${sheet.replace(REPO + "/", "")} redeclares tokens that ` +
        `packages/ui/src/styles/globals.css already owns. A second definition ` +
        `of a shared token is how the palettes drifted apart in the first ` +
        `place: it changes the token's meaning for every component rendered ` +
        `inside this scope, silently and invisibly in review.\n\n` +
        `To restyle one portal, point that portal's own component at an ` +
        `existing token instead — see \`.lg-seal\`, which asks for --money ` +
        `rather than redefining --seal for everybody. If the token really is ` +
        `portal-scoped and nothing else defines it, add it to PORTAL_OWNED ` +
        `here with a reason.\n\n` +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  });
});
