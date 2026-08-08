// The contrast the direction CLAIMS, checked against the tokens as written.
//
// The "Classical Ledger" direction ships one corrected value with a reason
// attached: --ink-3 is #6b6867 and NOT the source palette's #7d7979, "which
// fails AA at body sizes". A sentence in a handoff cannot keep that true — the
// next person to nudge a neutral one step warmer has no way to know they broke
// it, because nothing renders differently enough to notice. So the claim is a
// test.
//
// What it checks, and why each one:
//
//   · Text tokens against ALL THREE grounds. Meta text does not sit only on
//     --paper; it sits on cards (--sheet) and inside inputs and table headers
//     (--field). A ratio that holds on one ground and not the others is the
//     exact shape of the bug this file exists to catch.
//   · Badge pairs at 4.5:1, not 3:1. Badges render 11px/600, which is below the
//     large-text threshold however bold it looks.
//   · Gold. --gold is a STROKE token and is deliberately NOT asserted as text;
//     --gold-deep is the text form and is. If someone ever sets a label in
//     --gold, this file will not save them — but the direction says so, and
//     asserting --gold as text would quietly bless the wrong thing.
//
// Both themes, because dark is not a filter over light: its neutrals are chosen
// separately and drift separately.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GLOBALS = join(REPO, "packages/ui/src/styles/globals.css");

const css = readFileSync(GLOBALS, "utf8");

/** The hex custom properties declared inside one selector block. */
function palette(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${selector} not found in globals.css`);
  const open = css.indexOf("{", start);
  const block = css.slice(open + 1, css.indexOf("\n}", open));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear((n >> 16) & 255);
  const g = srgbToLinear((n >> 8) & 255);
  const b = srgbToLinear(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const AA = 4.5;

/** Text tokens that must hold AA on every ground they are ever painted on. */
const TEXT_ON_GROUNDS = ["--ink", "--ink-2", "--ink-3", "--gold-deep"] as const;
const GROUNDS = ["--paper", "--sheet", "--field"] as const;

/** Badge and seal pairs — foreground token, background token. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--teal", "--teal-soft"],
  ["--amber", "--amber-soft"],
  ["--red", "--red-soft"],
  ["--indigo", "--indigo-soft"],
  ["--ink-2", "--field"], // the DRAFT badge
  ["--seal", "--sheet"], // the seal, on the sheet it stamps
  ["--paper", "--ink"], // the primary button: paper on ink
];

describe.each([
  ["light", ":root"],
  ["dark", '[data-theme="dark"]'],
])("%s theme contrast", (theme, selector) => {
  const p = palette(selector);

  it("declares every token this file checks", () => {
    const needed = new Set<string>([
      ...TEXT_ON_GROUNDS,
      ...GROUNDS,
      ...PAIRS.flat(),
    ]);
    // --rule/--rule-2 are colour-mixes, not hexes, and are deliberately absent:
    // they are hairlines, not text, and have no AA obligation.
    for (const token of needed) {
      expect(p[token], `${token} must be a hex literal in ${selector}`).toBeTruthy();
    }
  });

  it.each(TEXT_ON_GROUNDS)("%s holds 4.5:1 on paper, sheet and field", (fg) => {
    for (const bg of GROUNDS) {
      const ratio = contrast(p[fg]!, p[bg]!);
      expect(
        Number(ratio.toFixed(2)),
        `${theme}: ${fg} (${p[fg]}) on ${bg} (${p[bg]}) is ${ratio.toFixed(2)}:1, below ${AA}:1`,
      ).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(PAIRS)("%s on %s holds 4.5:1", (fg, bg) => {
    const ratio = contrast(p[fg]!, p[bg]!);
    expect(
      Number(ratio.toFixed(2)),
      `${theme}: ${fg} (${p[fg]}) on ${bg} (${p[bg]}) is ${ratio.toFixed(2)}:1, below ${AA}:1`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it("the seal is the most legible thing in its row", () => {
    // The direction's fourth dark-mode check, stated as an ordering rather than
    // a number: whatever else is on the footer row, the seal out-contrasts the
    // meta text beside it. It marks permanence; if it reads as quieter than the
    // timestamp next to it, it is decoration.
    const seal = contrast(p["--seal"]!, p["--sheet"]!);
    const meta = contrast(p["--ink-3"]!, p["--sheet"]!);
    expect(
      Number(seal.toFixed(2)),
      `${theme}: seal ${seal.toFixed(2)}:1 must beat meta text ${meta.toFixed(2)}:1`,
    ).toBeGreaterThan(Number(meta.toFixed(2)));
  });
});

describe("the corrected neutral", () => {
  it("--ink-3 is not the source palette's #7d7979", () => {
    // Recorded because it is the one value the direction changed on purpose, and
    // a revert would look like a harmless tidy-up in review.
    const light = palette(":root");
    expect(light["--ink-3"]).not.toBe("#7d7979");
    expect(contrast("#7d7979", light["--sheet"]!)).toBeLessThan(AA);
    expect(contrast(light["--ink-3"]!, light["--sheet"]!)).toBeGreaterThanOrEqual(AA);
  });
});
