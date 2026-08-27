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

function readPng(file: string) {
  const buf = readFileSync(join(PUBLIC, file));
  return {
    bytes: buf.length,
    isPng: buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colourType: buf.readUInt8(25),
  };
}

describe("notification icons", () => {
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
    expect(readPng("notification-badge.png").colourType).toBe(6);
  });

  it("are drawn, not placeholders", () => {
    expect(readPng("notification-icon.png").bytes).toBeGreaterThan(500);
    expect(readPng("notification-badge.png").bytes).toBeGreaterThan(200);
  });
});

describe("the maskable home-screen icon", () => {
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

  it("is full-bleed", () => {
    expect(MASKABLE).toMatch(
      new RegExp(
        `<rect width="${EDURA_MARK_VIEWBOX}" height="${EDURA_MARK_VIEWBOX}"`,
      ),
    );
  });

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
    const outset = (EDURA_MARK_STROKE.heavy / 2) * scale;

    const worst = Math.max(
      ...points.map((p) => {
        const x = tx + (p.x + ox) * scale;
        const y = ty + (p.y + oy) * scale;
        return Math.hypot(x - centre, y - centre) + outset;
      }),
    );
    expect(worst).toBeLessThanOrEqual(safeRadius);
    expect(worst).toBeGreaterThan(safeRadius * 0.5);
  });

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
