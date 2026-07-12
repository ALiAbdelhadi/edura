import { describe, it, expect } from "vitest";
import {
  computeLessonSplit,
  PLATFORM_TEACHER_FEE,
  PLATFORM_CENTER_FEE,
} from "@/lib/services/finance/distribution";

/**
 * Money-distribution math (PRD §5.1, §0). All amounts are integer piasters.
 * These prove the exact fee model on real example numbers.
 */
describe("computeLessonSplit — PRD §5.1 fee model", () => {
  it("platform fee is exactly 2 EGP teacher + 2 EGP center = 4 EGP", () => {
    expect(PLATFORM_TEACHER_FEE).toBe(200);
    expect(PLATFORM_CENTER_FEE).toBe(200);
    const { platformNet } = computeLessonSplit(20000, 5000);
    expect(platformNet).toBe(400); // 4 EGP
  });

  it("PRD worked example: 200 EGP lesson, 50 EGP center share", () => {
    // lesson_price 20000, center_share 5000 (piasters)
    const s = computeLessonSplit(20000, 5000);
    // teacher_net = 20000 - 200 - 5000 = 14800  (148 EGP)
    expect(s.teacherNet).toBe(14800);
    // center_net  = 5000 - 200 = 4800  (48 EGP)
    expect(s.centerNet).toBe(4800);
    // platform    = 400 (4 EGP)
    expect(s.platformNet).toBe(400);
    // Conservation: everything the student paid is accounted for.
    expect(s.teacherNet + s.centerNet + s.platformNet).toBe(20000);
  });

  it("conservation holds for arbitrary price/share (no piaster leaks)", () => {
    for (const [price, share] of [
      [20000, 5000],
      [15000, 0],
      [100000, 25000],
      [30000, 10000],
      [50050, 12345],
    ] as const) {
      const s = computeLessonSplit(price, share);
      expect(s.teacherNet + s.centerNet + s.platformNet).toBe(price);
    }
  });

  it("zero center share: center still owes its 2 EGP platform fee (net -2 EGP)", () => {
    const s = computeLessonSplit(20000, 0);
    expect(s.teacherNet).toBe(19800); // 20000 - 200 - 0
    expect(s.centerNet).toBe(-200); // 0 - 200  (center owes the platform fee)
    expect(s.platformNet).toBe(400);
    expect(s.teacherNet + s.centerNet + s.platformNet).toBe(20000);
  });

  it("center share equal to price: teacher nets negative (edge, math still conserves)", () => {
    const s = computeLessonSplit(20000, 20000);
    expect(s.teacherNet).toBe(-200); // 20000 - 200 - 20000
    expect(s.centerNet).toBe(19800); // 20000 - 200
    expect(s.teacherNet + s.centerNet + s.platformNet).toBe(20000);
  });

  it("all outputs are integers (piasters never fractional)", () => {
    const s = computeLessonSplit(33333, 11111);
    expect(Number.isInteger(s.teacherNet)).toBe(true);
    expect(Number.isInteger(s.centerNet)).toBe(true);
    expect(Number.isInteger(s.platformNet)).toBe(true);
  });
});
