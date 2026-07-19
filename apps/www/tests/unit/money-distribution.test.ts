import { describe, it, expect } from "vitest";
import { computeLessonSplit, computeTeacherDirectSplit } from "@/lib/services/finance/fees";

// Step 4.5: fees are configurable (commission_settings). The platform default
// stays the PRD §5.1 model — 2 EGP teacher + 2 EGP center per present student.
const DEFAULT_FEES = { platformTeacherFee: 200, platformCenterFee: 200 };

describe("computeLessonSplit — PRD §5.1 fee model (default fees)", () => {
  it("default platform fee is exactly 2 EGP teacher + 2 EGP center = 4 EGP", () => {
    const { platformNet } = computeLessonSplit(20000, 5000, DEFAULT_FEES);
    expect(platformNet).toBe(400); // 4 EGP
  });

  it("PRD worked example: 200 EGP lesson, 50 EGP center share", () => {
    const s = computeLessonSplit(20000, 5000, DEFAULT_FEES);
    expect(s.teacherNet).toBe(14800);
    expect(s.centerNet).toBe(4800);
    expect(s.platformNet).toBe(400);
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
      const s = computeLessonSplit(price, share, DEFAULT_FEES);
      expect(s.teacherNet + s.centerNet + s.platformNet).toBe(price);
    }
  });

  it("configured fees flow through the split", () => {
    const s = computeLessonSplit(20000, 5000, { platformTeacherFee: 300, platformCenterFee: 100 });
    expect(s.teacherNet).toBe(14700);
    expect(s.centerNet).toBe(4900);
    expect(s.platformNet).toBe(400);
    expect(s.teacherNet + s.centerNet + s.platformNet).toBe(20000);
  });

  it("zero center share: center still owes its 2 EGP platform fee (net -2 EGP)", () => {
    const s = computeLessonSplit(20000, 0, DEFAULT_FEES);
    expect(s.teacherNet).toBe(19800);
    expect(s.centerNet).toBe(-200);
    expect(s.platformNet).toBe(400);
    expect(s.teacherNet + s.centerNet + s.platformNet).toBe(20000);
  });

  it("center share equal to price: teacher nets negative (edge, math still conserves)", () => {
    const s = computeLessonSplit(20000, 20000, DEFAULT_FEES);
    expect(s.teacherNet).toBe(-200);
    expect(s.centerNet).toBe(19800);
    expect(s.teacherNet + s.centerNet + s.platformNet).toBe(20000);
  });

  it("all outputs are integers (piasters never fractional)", () => {
    const s = computeLessonSplit(33333, 11111, DEFAULT_FEES);
    expect(Number.isInteger(s.teacherNet)).toBe(true);
    expect(Number.isInteger(s.centerNet)).toBe(true);
    expect(Number.isInteger(s.platformNet)).toBe(true);
  });
});

describe("computeTeacherDirectSplit — commission in basis points", () => {
  it("15% default: 300 EGP -> 255 teacher / 45 platform", () => {
    const s = computeTeacherDirectSplit(30000, 1500);
    expect(s.teacherNet).toBe(25500);
    expect(s.platformCommission).toBe(4500);
    expect(s.teacherNet + s.platformCommission).toBe(30000);
  });

  it("rate changes flow through (20%)", () => {
    const s = computeTeacherDirectSplit(30000, 2000);
    expect(s.teacherNet).toBe(24000);
    expect(s.platformCommission).toBe(6000);
  });

  it("rounds to whole piasters and conserves", () => {
    for (const [price, bp] of [
      [33333, 1500],
      [10001, 1234],
      [99999, 333],
    ] as const) {
      const s = computeTeacherDirectSplit(price, bp);
      expect(Number.isInteger(s.platformCommission)).toBe(true);
      expect(s.teacherNet + s.platformCommission).toBe(price);
    }
  });

  it("0% and 100% edges", () => {
    expect(computeTeacherDirectSplit(30000, 0)).toEqual({ teacherNet: 30000, platformCommission: 0 });
    expect(computeTeacherDirectSplit(30000, 10000)).toEqual({ teacherNet: 0, platformCommission: 30000 });
  });
});
