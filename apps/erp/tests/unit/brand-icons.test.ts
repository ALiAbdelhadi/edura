import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_BADGE,
  NOTIFICATION_ICON,
  notificationSpec,
} from "@/lib/pwa/sw-handlers";
import {
  EDURA_MARK_PATHS,
  EDURA_MARK_STROKE,
  EDURA_MARK_VIEWBOX,
} from "@repo/ui/lib/edura-mark";

const PUBLIC = join(process.cwd(), "public");
const read = (f: string) => readFileSync(join(PUBLIC, f), "utf8");
const MASKABLE = read("edura-maskable.svg");
const LOGO = read("edura-logo.svg");
const MANIFEST = readFileSync(join(process.cwd(), "src/app/manifest.ts"), "utf8");
const LAYOUT = readFileSync(
  join(process.cwd(), "src/app/[locale]/layout.tsx"),
  "utf8",
);
const INVITE_ACCEPT = readFileSync(
  join(process.cwd(), "src/app/[locale]/invite/accept/page.tsx"),
  "utf8",
);
const RETIRED_EDUCONNECT_HUES = ["#5b76fe", "#7c4fe0", "#00b473", "#187574", "#ffc6c6"];

/** Minimal PNG header reader — width/height/colour type live at fixed offsets. */
function readPng(file: string) {
  const buf = readFileSync(join(PUBLIC, file));
  return {
    bytes: buf.length,
    isPng: buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    /** 6 = truecolour with alpha. */
    colourType: buf.readUInt8(25),
  };
}

describe("notification icons", () => {
  /**
   * THE BUG THIS LOCKS DOWN: both `icon` and `badge` pointed at
   * `/edura-mark.svg`, and Chrome on Android renders NEITHER as SVG — it shows
   * its own generic glyph and says nothing. On an Android-first product that
   * meant every push arrived unbranded, and no test or build step could notice.
   */
  it("are PNG, not SVG", () => {
    const spec = notificationSpec({ title: "t" });
    expect(spec.options.icon).toBe(NOTIFICATION_ICON);
    expect(spec.options.badge).toBe(NOTIFICATION_BADGE);
    expect(spec.options.icon).not.toMatch(/\.svg$/);
    expect(spec.options.badge).not.toMatch(/\.svg$/);
  });

  it("exist at the sizes the platforms ask for", () => {
    const icon = readPng("notification-icon.png");
    expect(icon.isPng).toBe(true);
    expect([icon.width, icon.height]).toEqual([192, 192]);
    const badge = readPng("notification-badge.png");
    expect(badge.isPng).toBe(true);
    expect([badge.width, badge.height]).toEqual([96, 96]);
  });

  it("keep an alpha channel — the badge is nothing without it", () => {
    // Android throws the badge's colour away and tints its ALPHA white. A
    // badge flattened onto a background would render as a solid square.
    expect(readPng("notification-badge.png").colourType).toBe(6);
  });

  it("are drawn, not placeholders", () => {
    expect(readPng("notification-icon.png").bytes).toBeGreaterThan(500);
    expect(readPng("notification-badge.png").bytes).toBeGreaterThan(200);
  });
});

describe("the maskable home-screen icon", () => {
  /**
   * The file this replaced was the retired EduConnect mark — a violet→indigo
   * gradient plus #00b473 — while the favicon had already been redrawn in the
   * Ledger language. An installed app was showing two different brands, and
   * nothing failed. These are the three hues that must never come back.
   */
  it("carries none of the retired EduConnect palette", () => {
    for (const hue of RETIRED_EDUCONNECT_HUES) {
      expect(MASKABLE.toLowerCase()).not.toContain(hue);
    }
  });

  it("has no gradient — CONSTITUTION §4 forbids the device", () => {
    expect(MASKABLE).not.toMatch(/linearGradient|radialGradient|url\(#/);
  });

  it("uses only Ledger palette values", () => {
    const hexes = [...MASKABLE.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) =>
      m[0].toLowerCase(),
    );
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(["#f3f2f2", "#201f1d", "#b68235"]).toContain(hex);
    }
  });

  it("draws the same geometry as the shared mark", () => {
    for (const p of EDURA_MARK_PATHS) expect(MASKABLE).toContain(`d="${p.d}"`);
  });

  /**
   * A maskable icon is cropped to a circle / squircle / teardrop, so it must be
   * FULL BLEED — transparency shows as white or black corners on the home
   * screen. This is the one place a filled tile is not merely permitted but
   * required.
   */
  it("is full-bleed", () => {
    expect(MASKABLE).toMatch(
      new RegExp(
        `<rect width="${EDURA_MARK_VIEWBOX}" height="${EDURA_MARK_VIEWBOX}"`,
      ),
    );
  });

  /**
   * Recomputed from the transform in the FILE, not restated: the glyph's
   * stroked extremities must sit inside the 80%-diameter safe circle, or a
   * launcher that crops hard slices the mark.
   */
  it("keeps the whole mark inside the maskable safe zone", () => {
    const m = MASKABLE.match(
      /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\) translate\((-?[\d.]+) (-?[\d.]+)\)/,
    );
    expect(m, "the maskable transform should be parseable").not.toBeNull();
    const [, tx, ty, scale, ox, oy] = m!.map(Number) as unknown as number[];

    const points = EDURA_MARK_PATHS.flatMap((p) =>
      [...p.d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((c) => ({
        x: Number(c[1]),
        y: Number(c[2]),
      })),
    );
    expect(points.length).toBeGreaterThan(4);

    const centre = EDURA_MARK_VIEWBOX / 2;
    const safeRadius = EDURA_MARK_VIEWBOX * 0.4;
    // Round joins outset every vertex by half the heaviest stroke.
    const outset = (EDURA_MARK_STROKE.heavy / 2) * scale;

    const worst = Math.max(
      ...points.map((p) => {
        const x = tx + (p.x + ox) * scale;
        const y = ty + (p.y + oy) * scale;
        return Math.hypot(x - centre, y - centre) + outset;
      }),
    );
    expect(worst).toBeLessThanOrEqual(safeRadius);
    // And it should not be so timid that the icon reads as a speck.
    expect(worst).toBeGreaterThan(safeRadius * 0.5);
  });

  /**
   * Caught the hard way: the generated comment contained `--`, which is illegal
   * inside an XML comment, and the whole file failed to parse as SVG.
   */
  it("contains no XML-illegal comment", () => {
    for (const c of MASKABLE.matchAll(/<!--([\s\S]*?)-->/g)) {
      expect(c[1]).not.toContain("--");
    }
  });

  it("is still what the manifest points at, as the maskable purpose", () => {
    expect(MANIFEST).toContain("/edura-maskable.svg");
    expect(MANIFEST).toContain('purpose: "maskable"');
  });
});

describe("the iOS home-screen icon", () => {
  /**
   * iOS Safari does not support SVG for apple-touch-icon, so pointing it at
   * `/edura-mark.svg` gave iPhone users a blank tile on "Add to Home Screen"
   * while Android showed the mark.
   */
  it("is a PNG at the size iOS asks for", () => {
    const apple = readPng("apple-touch-icon.png");
    expect(apple.isPng).toBe(true);
    expect([apple.width, apple.height]).toEqual([180, 180]);
    expect(apple.bytes).toBeGreaterThan(500);
  });

  it("is what the layout declares", () => {
    expect(LAYOUT).toContain('apple: "/apple-touch-icon.png"');
    expect(LAYOUT).not.toMatch(/apple:\s*"[^"]*\.svg"/);
  });
});

describe("the wordmark", () => {
  /**
   * `edura-logo.svg` was the one asset the earlier icon pass missed: the
   * favicon, the maskable icon and the notification pair were all redrawn
   * from `EDURA_MARK_PATHS`, while this file stayed the retired EduConnect
   * wordmark — a violet-to-indigo gradient tile plus two further gradients
   * for the pin and the "ra" of the name. One screen (invite acceptance)
   * showing a different brand than everywhere else, and nothing failed.
   */
  it("carries none of the retired EduConnect palette", () => {
    for (const hue of RETIRED_EDUCONNECT_HUES) {
      expect(LOGO.toLowerCase()).not.toContain(hue);
    }
  });

  it("has no gradient — CONSTITUTION §4 forbids the device", () => {
    expect(LOGO).not.toMatch(/linearGradient|radialGradient|url\(#/);
  });

  it("draws the same geometry as the shared mark", () => {
    for (const p of EDURA_MARK_PATHS) expect(LOGO).toContain(`d="${p.d}"`);
  });

  it("says it is generated, so nobody hand-edits the output", () => {
    expect(LOGO).toContain("GENERATED by scripts/generate-brand-icons.ts");
  });

  it("is still what the invite-acceptance screen points at", () => {
    expect(INVITE_ACCEPT).toContain('src="/edura-logo.svg"');
  });
});

describe("all of them", () => {
  /**
   * The generator is a CONSUMER of the shared geometry, never a copy of it —
   * the same reason the student card's SVG and its PNG exporter both read these
   * strings.
   */
  it("are generated from the one shared mark geometry", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/generate-brand-icons.ts"),
      "utf8",
    );
    expect(script).toContain("@repo/ui/lib/edura-mark");
    expect(script).toContain("EDURA_MARK_PATHS");
    expect(script).toContain("EDURA_MARK_STROKE");
    expect(EDURA_MARK_PATHS.length).toBeGreaterThan(0);
    expect(EDURA_MARK_STROKE.heavy).toBeGreaterThan(EDURA_MARK_STROKE.light);
  });

  it("say they are generated, so nobody hand-edits the output", () => {
    expect(MASKABLE).toContain("GENERATED by scripts/generate-brand-icons.ts");
  });
});
