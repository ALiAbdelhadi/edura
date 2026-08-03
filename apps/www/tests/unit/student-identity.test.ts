import { describe, expect, it } from "vitest";
import {
  guillochePasses,
  rosettePath,
  rosettePoints,
  studentIdentity,
} from "@repo/ui/lib/student-identity";

// ===========================================================================
// THE ENGRAVING — the two properties the whole idea rests on.
//
//   1. It is THEIRS: same student, same pattern, forever. A card printed today
//      and one printed in two years must be the same card. Nothing is stored,
//      so this is a property of the function or it is not true at all.
//   2. It is DIFFERENT: two students must not look alike. Tested across five
//      thousand seeds rather than a handful, because "unique enough" on a
//      sample of ten proves nothing about a school.
// ===========================================================================

function uuidish(i: number): string {
  const h = (n: number) => n.toString(16).padStart(8, "0");
  return `${h(i * 2654435761)}-0000-4000-8000-${h(i).repeat(3).slice(0, 12)}`;
}

describe("determinism", () => {
  it("gives the same student the same pattern every time", () => {
    const seed = uuidish(42);
    expect(studentIdentity(seed)).toEqual(studentIdentity(seed));
  });

  it("draws the same geometry for the same identity", () => {
    const identity = studentIdentity(uuidish(7));
    const a = rosettePath(identity.rosettes[0], 0, 100, 100, 80, identity.rotation);
    const b = rosettePath(identity.rosettes[0], 0, 100, 100, 80, identity.rotation);
    expect(a).toBe(b);
    expect(a.startsWith("M")).toBe(true);
    expect(a.endsWith("Z")).toBe(true);
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

describe("distinctness", () => {
  const identities = Array.from({ length: 5000 }, (_, i) => studentIdentity(uuidish(i)));

  it("gives 5000 students very few repeated patterns", () => {
    const shapes = new Set(
      identities.map((id) =>
        [
          id.tone,
          id.rosettes[0].lobes,
          id.rosettes[1].lobes,
          id.rosettes[0].amplitude.toFixed(3),
          id.rosettes[1].amplitude.toFixed(3),
          id.rosettes[0].phase.toFixed(2),
          id.rotation.toFixed(2),
        ].join("|"),
      ),
    );
    // Collisions on the full parameter vector should be essentially absent;
    // anything below this and two children in one class could match.
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
    for (const tone of Object.values(counts)) expect(tone).toBeGreaterThan(1000);
  });
});

describe("inside the palette", () => {
  it("only ever names one of the three permitted accents — never a new hue", () => {
    const allowed = new Set(["indigo", "teal", "amber"]);
    for (let i = 0; i < 2000; i++) {
      expect(allowed.has(studentIdentity(uuidish(i)).tone)).toBe(true);
    }
  });

  it("stays inside its box, so the engraving cannot bleed over the text", () => {
    const identity = studentIdentity(uuidish(3));
    for (const pass of guillochePasses(identity)) {
      for (const [x, y] of rosettePoints(pass.rosette, pass.stroke, 0, 0, 100, identity.rotation, 64)) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(120);
      }
    }
  });
});
