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

// ===========================================================================
// THE ENGRAVING — the three properties the whole idea rests on.
//
//   1. It is THEIRS: same student, same pattern, forever. A card printed today
//      and one printed in two years must be the same card. Nothing is stored,
//      so this is a property of the function or it is not true at all.
//   2. It is DIFFERENT — and differently ENOUGH. The first version passed a
//      distinctness test on its parameter vector and still looked identical to
//      a human, because the parameters it varied were ones nobody perceives.
//      So the assertions below are about PERCEPTIBLE difference: the plate
//      (silhouette), the accent pair, the ink weight — not just "some float
//      differs in the third decimal".
//   3. It stays INSIDE THE PALETTE. Three accents, stroke only, no new hue.
//
// The 2026-08-10 rewrite exists because (2) was being measured wrongly. A test
// that passes while the thing it tests is visibly broken is worse than no test,
// so this file now measures what the eye measures.
// ===========================================================================

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
    // No plate may be rare enough that a school never sees it.
    for (const n of counts.values()) expect(n).toBeGreaterThan(900);
  });

  it("TWO STUDENTS SIDE BY SIDE USUALLY DIFFER IN SILHOUETTE", () => {
    // The one that matters. With four plates, two unrelated students differ in
    // composition ~3 times in 4 — and when they do, no amount of squinting is
    // needed. The old design scored ZERO here: there was only one plate.
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
    // A 2× spread in hairline weight: a light plate and a heavy one do not look
    // like the same card even at identical geometry.
    expect(Math.min(...w)).toBeLessThan(0.62);
    expect(Math.max(...w)).toBeGreaterThan(1.05);
  });

  it("draws the engraving in INK A PERSON CAN SEE", () => {
    // The old bug, held closed. Passes carried 0.18–0.50 and both renderers
    // then multiplied by 0.55 → an effective 0.10 at the faintest. `opacity` is
    // now FINAL, and a renderer that re-applies a factor will fail this.
    for (const id of identities.slice(0, 300)) {
      const passes = guillochePasses(id, CARD_W, CARD_H);
      const top = Math.max(...passes.map((p) => p.opacity));
      expect(top).toBeGreaterThan(0.35);
      for (const p of passes) {
        expect(p.opacity).toBeGreaterThan(0.1);
        // …but never so heavy that it competes with the text on top of it.
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
    // Not a nicety: the card mirrors between Arabic and English. A plate
    // anchored to one side sits under the student's name in one of the two
    // languages, which is why there is no corner medallion in the set.
    // Measured as the horizontal centre of mass sitting on the card's midline.
    for (const id of identities.slice(0, 400)) {
      const xs = guillochePasses(id, CARD_W, CARD_H).flatMap((p) => p.points.map(([x]) => x));
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(Math.abs(mean - CARD_W / 2)).toBeLessThan(CARD_W * 0.02);
    }
  });

  it("stays inside the card, so the engraving cannot bleed off three edges", () => {
    // Bounds are REDUCED first and asserted once per identity. Asserting on
    // every point ran ten million `expect()` calls, took a minute, and reported
    // a bare number with no clue which plate produced it — a test nobody can
    // read the failure of is a test that gets deleted.
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
      // The band plate deliberately runs off the left and right edges (a band
      // stopping short of the trim reads as a mistake), so the horizontal bound
      // is generous. The VERTICAL one is not: a medallion clipped by the card's
      // rounded corner turns into a flat cut that looks like a rendering bug,
      // which is exactly what this caught when plates were sized by their base
      // radius instead of their outer envelope.
      const where = `plate=${id.plate}`;
      expect(minX, where).toBeGreaterThan(-CARD_W * 0.05);
      expect(maxX, where).toBeLessThan(CARD_W * 1.05);
      expect(minY, where).toBeGreaterThan(0);
      expect(maxY, where).toBeLessThan(CARD_H);
    }
  });
});
