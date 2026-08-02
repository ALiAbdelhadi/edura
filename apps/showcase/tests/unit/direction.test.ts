import { describe, expect, it } from "vitest";
import {
  directionFactor,
  filmstripTravel,
  logicalX,
  PHYSICAL,
} from "../../src/lib/motion/direction";

/**
 * Arabic is this product's PRIMARY language, so a mirrored animation is the
 * default case rather than an afterthought — and the sign errors are invisible
 * in code review (every value is just a number) but obvious on screen, where an
 * element enters from the edge the eye is leaving toward.
 *
 * The `filmstripTravel` direction was wrong in the first draft of this module.
 * These assertions are what caught it.
 */

const LTR = false;
const RTL = true;

describe("directionFactor", () => {
  it("is +1 in LTR and -1 in RTL", () => {
    expect(directionFactor(LTR)).toBe(1);
    expect(directionFactor(RTL)).toBe(-1);
  });
});

describe("logicalX", () => {
  it("moves toward the LEFT for a start-edge offset in LTR", () => {
    expect(logicalX(40, "start", LTR)).toBe(-40);
  });

  it("moves toward the RIGHT for the same offset in RTL", () => {
    expect(logicalX(40, "start", RTL)).toBe(40);
  });

  it("mirrors end-edge offsets too", () => {
    expect(logicalX(40, "end", LTR)).toBe(40);
    expect(logicalX(40, "end", RTL)).toBe(-40);
  });

  it("produces exactly opposite values in the two directions", () => {
    for (const from of ["start", "end"] as const) {
      expect(logicalX(17, from, LTR)).toBe(-logicalX(17, from, RTL));
    }
  });

  it("leaves a zero offset at zero rather than producing -0", () => {
    // -0 compares equal to 0 but serialises differently and has bitten
    // snapshot assertions before.
    expect(Object.is(logicalX(0, "start", RTL), -0)).toBe(false);
  });
});

describe("filmstripTravel", () => {
  const TRACK = 3000;
  const VIEWPORT = 1000;

  it("scrolls the track LEFT in LTR so later items come into view", () => {
    expect(filmstripTravel(TRACK, VIEWPORT, LTR)).toBe(-2000);
  });

  it("scrolls the track RIGHT in RTL, because row layout is already mirrored", () => {
    expect(filmstripTravel(TRACK, VIEWPORT, RTL)).toBe(2000);
  });

  it("never travels when the track already fits", () => {
    expect(filmstripTravel(400, 1000, LTR)).toBe(0);
    expect(filmstripTravel(400, 1000, RTL)).toBe(0);
  });

  it("moves the same absolute distance in both directions", () => {
    expect(Math.abs(filmstripTravel(TRACK, VIEWPORT, LTR))).toBe(
      Math.abs(filmstripTravel(TRACK, VIEWPORT, RTL)),
    );
  });
});

describe("PHYSICAL", () => {
  it("is identity — it marks intent, it does not transform", () => {
    // The seal's rotation, a chart's time axis and --lift shadows deliberately
    // do NOT mirror (CONSTITUTION.md §6.4). Wrapping them documents that at the
    // call site instead of leaving the omission to look like a bug.
    expect(PHYSICAL(-6)).toBe(-6);
    expect(PHYSICAL("rotate(-6deg)")).toBe("rotate(-6deg)");
  });
});
