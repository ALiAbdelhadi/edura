import { describe, expect, it } from "vitest";
import {
  type AccentName,
  type PlateKind,
  guillochePasses,
  rosettePath,
  rosettePoints,
  studentIdentity,
  toPath,
} from "@repo/ui/lib/student-identity";

function uuidish(i: number): string {
  const h = (n: number) => n.toString(16).padStart(8, "0");
  return `${h(i * 2654435761)}-0000-4000-8000-${h(i).repeat(3).slice(0, 12)}`;
}

const CARD_W = 856;
const CARD_H = 540;
const SEEDS = Array.from({ length: 5000 }, (_, i) => uuidish(i));
const identities = SEEDS.map(studentIdentity);

describe("determinism", () => {
  it("gives the same student the same pattern every time", () => {
    const seed = uuidish(42);
    expect(studentIdentity(seed)).toEqual(studentIdentity(seed));
  });

  it("draws the same plate every time — the card in their pocket still matches", () => {
    const id = studentIdentity(uuidish(7));
    const a = guillochePasses(id, CARD_W, CARD_H);
    const b = guillochePasses(id, CARD_W, CARD_H);
    expect(toPath(a[0]!.points)).toBe(toPath(b[0]!.points));
    expect(a.length).toBe(b.length);
  });

  it("keeps the SVG path and the canvas points in step — they are one function", () => {
    const identity = studentIdentity(uuidish(11));
    const pts = rosettePoints(identity.rosettes[0], 2, 100, 100, 80, identity.rotation, 12);
    const path = rosettePath(identity.rosettes[0], 2, 100, 100, 80, identity.rotation, 12);
    const first = pts[0] as [number, number];
    expect(path).toContain(`M${first[0].toFixed(2)} ${first[1].toFixed(2)}`);
    expect(pts).toHaveLength(13);
  });
});

describe("perceptible difference — the property that was actually failing", () => {
  it("uses every plate, and spreads across them", () => {
    const counts = new Map<PlateKind, number>();
    for (const id of identities) counts.set(id.plate, (counts.get(id.plate) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual(["band", "medallion", "orbit", "twin"]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(900);
  });

  it("TWO STUDENTS SIDE BY SIDE USUALLY DIFFER IN SILHOUETTE", () => {
    let differentPlate = 0;
    const pairs = 2000;
    for (let i = 0; i < pairs; i++) {
      if (identities[i]!.plate !== identities[i + 2000]!.plate) differentPlate++;
    }
    expect(differentPlate / pairs).toBeGreaterThan(0.7);
  });

  it("the two accents on a card are never the same accent", () => {
    for (const id of identities) expect(id.toneAlt).not.toBe(id.tone);
  });

  it("uses all six ordered accent pairs", () => {
    const pairs = new Set(identities.map((id) => `${id.tone}>${id.toneAlt}`));
    expect(pairs.size).toBe(6);
  });

  it("varies ink weight over a range a person can see", () => {
    const w = identities.map((id) => id.weight);
    expect(Math.min(...w)).toBeLessThan(0.62);
    expect(Math.max(...w)).toBeGreaterThan(1.05);
  });

  it("draws the engraving in INK A PERSON CAN SEE", () => {
    for (const id of identities.slice(0, 300)) {
      const passes = guillochePasses(id, CARD_W, CARD_H);
      const top = Math.max(...passes.map((p) => p.opacity));
      expect(top).toBeGreaterThan(0.35);
      for (const p of passes) {
        expect(p.opacity).toBeGreaterThan(0.1);
        expect(p.opacity).toBeLessThanOrEqual(0.55);
      }
    }
  });

  it("gives 5000 students essentially no repeated plates", () => {
    const shapes = new Set(
      identities.map((id) =>
        [
          id.plate,
          id.tone,
          id.toneAlt,
          id.rosettes[0].lobes,
          id.rosettes[1].lobes,
          id.rosettes[0].amplitude.toFixed(3),
          id.rosettes[1].amplitude.toFixed(3),
          id.weight.toFixed(3),
        ].join("|"),
      ),
    );
    expect(shapes.size).toBeGreaterThan(4990);
  });

  it("never lets the two rosettes coincide — the interference IS the pattern", () => {
    for (const id of identities) {
      expect(id.rosettes[1].lobes).not.toBe(id.rosettes[0].lobes);
    }
  });

  it("spreads across all three accents", () => {
    const counts = { indigo: 0, teal: 0, amber: 0 };
    for (const id of identities) counts[id.tone]++;
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(1000);
  });
});

describe("inside the palette, and inside the card", () => {
  it("only ever names one of the three permitted accents — never a new hue", () => {
    const allowed = new Set<AccentName>(["indigo", "teal", "amber"]);
    for (const id of identities.slice(0, 2000)) {
      expect(allowed.has(id.tone)).toBe(true);
      expect(allowed.has(id.toneAlt)).toBe(true);
    }
    for (const pass of guillochePasses(identities[3]!, CARD_W, CARD_H)) {
      expect(allowed.has(pass.tone)).toBe(true);
    }
  });

  it("EVERY PLATE IS SYMMETRIC ABOUT THE VERTICAL AXIS", () => {
    for (const id of identities.slice(0, 400)) {
      const xs = guillochePasses(id, CARD_W, CARD_H).flatMap((p) => p.points.map(([x]) => x));
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(Math.abs(mean - CARD_W / 2)).toBeLessThan(CARD_W * 0.02);
    }
  });

  it("stays inside the card, so the engraving cannot bleed off three edges", () => {
    for (const id of identities.slice(0, 600)) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pass of guillochePasses(id, CARD_W, CARD_H)) {
        for (const [x, y] of pass.points) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const where = `plate=${id.plate}`;
      expect(minX, where).toBeGreaterThan(-CARD_W * 0.05);
      expect(maxX, where).toBeLessThan(CARD_W * 1.05);
      expect(minY, where).toBeGreaterThan(0);
      expect(maxY, where).toBeLessThan(CARD_H);
    }
  });
});
