/* The counter's clock.
 *
 * `schedule_patterns.start_time` is a bare `HH:MM` wall-clock string, so it never
 * passed through Intl and every screen printed a 24-hour time. These assertions
 * hold the replacement to the two things that make it worth doing: the day period
 * is a WORD, and the digits stay Latin and stay in order inside Arabic text. */

import { describe, expect, it } from "vitest";

import { formatClock, formatClockRange, formatClockText } from "@repo/ui/lib/format";

/** U+2066 LRI … U+2069 PDI — strip when asserting on the visible characters. */
const bare = (s: string) => s.replace(/[⁦⁩]/g, "");

describe("formatClock", () => {
  it("writes the Egyptian day period as a word, not a letter", () => {
    expect(bare(formatClock("08:00", "ar"))).toBe("8:00 صباحًا");
    expect(bare(formatClock("12:00", "ar"))).toBe("12:00 ظهرًا");
    expect(bare(formatClock("16:00", "ar"))).toBe("4:00 عصرًا");
    expect(bare(formatClock("22:00", "ar"))).toBe("10:00 مساءً");
    expect(bare(formatClock("00:15", "ar"))).toBe("12:15 ليلًا");
  });

  it("never abbreviates to ص / م", () => {
    for (let h = 0; h < 24; h++) {
      const out = bare(formatClock(`${String(h).padStart(2, "0")}:30`, "ar"));
      expect(out).not.toMatch(/\s[صم]$/);
    }
  });

  /* CLDR's own dayPeriod calls 00:15 «في المساء» in ar-EG — the wrong half of the
     day. This is the reason the buckets are written out in format.ts. */
  it("puts midnight in the night, not the evening", () => {
    expect(bare(formatClock("00:15", "ar"))).not.toContain("مساء");
  });

  it("uses AM / PM in English", () => {
    expect(bare(formatClock("16:00", "en"))).toBe("4:00 PM");
    expect(bare(formatClock("00:15", "en"))).toBe("12:15 AM");
    expect(bare(formatClock("12:00", "en"))).toBe("12:00 PM");
  });

  it("keeps Latin digits and wraps the whole time in one LTR island", () => {
    const out = formatClock("16:05", "ar");
    expect(out).not.toMatch(/[٠-٩]/);
    expect(out.startsWith("⁦") && out.endsWith("⁩")).toBe(true);
    // Exactly one island — a second would let an RTL row reorder the pieces.
    expect(out.match(/⁦/g)).toHaveLength(1);
  });

  it("returns anything that is not a clock string untouched", () => {
    expect(formatClock("", "ar")).toBe("");
    expect(formatClock(null, "ar")).toBe("");
    expect(formatClock(undefined, "en")).toBe("");
    expect(formatClock("مؤجلة", "ar")).toBe("مؤجلة");
    expect(formatClock("25:00", "ar")).toBe("25:00");
  });

  it("accepts the seconds a database column may carry", () => {
    expect(bare(formatClock("16:00:00", "ar"))).toBe("4:00 عصرًا");
  });
});

describe("formatClockRange", () => {
  it("writes the period once when both ends share it", () => {
    expect(bare(formatClockRange("20:00", "22:00", "ar"))).toBe("8:00 – 10:00 مساءً");
    expect(bare(formatClockRange("13:00", "15:00", "en"))).toBe("1:00 – 3:00 PM");
  });

  it("writes both when the lesson crosses into another period", () => {
    expect(bare(formatClockRange("16:00", "18:00", "ar"))).toBe(
      "4:00 عصرًا – 6:00 مساءً",
    );
    expect(bare(formatClockRange("10:00", "12:00", "ar"))).toBe(
      "10:00 صباحًا – 12:00 ظهرًا",
    );
    expect(bare(formatClockRange("11:00", "13:00", "en"))).toBe("11:00 AM – 1:00 PM");
  });

  /* One island around the PAIR. Two separately isolated times in an RTL row lay out
     right-to-left — `4:00 – 6:00` becomes `6:00 – 4:00`, a lesson ending before it
     starts. This is the assertion that stops someone "tidying" the isolates. */
  it("wraps the pair in exactly one LTR island, start first", () => {
    const out = formatClockRange("16:00", "18:00", "ar");
    expect(out.match(/⁦/g)).toHaveLength(1);
    expect(out.startsWith("⁦") && out.endsWith("⁩")).toBe(true);
    expect(out.indexOf("4:00")).toBeLessThan(out.indexOf("6:00"));
  });

  it("degrades to whichever end it was given", () => {
    expect(bare(formatClockRange("16:00", null, "ar"))).toBe("4:00 عصرًا");
    expect(bare(formatClockRange(undefined, "18:00", "ar"))).toBe("6:00 مساءً");
    expect(formatClockRange(null, undefined, "ar")).toBe("");
  });

  it("passes an unparseable end through rather than dropping the row", () => {
    expect(bare(formatClockRange("16:00", "later", "ar"))).toBe("4:00 عصرًا – later");
  });
});

/* The guided-tour worlds hold their schedules as joined literals, so the tour has
   to read the clock the same way the product it demonstrates does. */
describe("formatClockText", () => {
  it("reads the joined literals the tour worlds carry", () => {
    expect(bare(formatClockText("16:00 – 17:30", "ar"))).toBe("4:00 – 5:30 عصرًا");
    expect(bare(formatClockText("16:00", "ar"))).toBe("4:00 عصرًا");
    expect(bare(formatClockText("15:00 - 16:30", "en"))).toBe("3:00 – 4:30 PM");
  });

  it("leaves anything that is not a clock alone", () => {
    expect(formatClockText("", "ar")).toBe("");
    expect(formatClockText(null, "ar")).toBe("");
    expect(formatClockText("قريبًا", "ar")).toBe("قريبًا");
    expect(formatClockText("مساءً - غدًا", "ar")).toBe("مساءً - غدًا");
    expect(formatClockText("8:00 - 9:00 - 10:00", "ar")).toBe("8:00 - 9:00 - 10:00");
  });
});
