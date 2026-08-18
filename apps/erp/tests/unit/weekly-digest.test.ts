import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@repo/notifications";

// Reached THROUGH the registry, not by importing the template file: that is
// how the dispatcher reaches it, so these tests also prove the wiring.
const digest = TEMPLATES.weekly_digest.email;
const weeklyDigestSubject = digest.subject;
const weeklyDigestText = digest.text;
const WeeklyDigestEmail = digest.Body;

// The weekly digest EMAIL. The job that gathers the figures is exercised
// against the live database; this pins what the owner actually receives —
// which is where a formatting mistake turns "3,450.00 EGP" into "345000" and
// a center owner concludes the platform lost their money.

const base = {
  centerName: "مركز النيل",
  periodStart: "2026-08-03",
  periodEnd: "2026-08-09",
  revenuePiasters: 345_000,
  expensesPiasters: 120_000,
  netPiasters: 225_000,
  attendanceRatePct: 92,
  sessionsCount: 14,
  gapsCount: 0,
  link: "https://app.edura.test/ar/dashboard/admin/reports",
};

describe("weekly digest — registration", () => {
  it("is in the template registry with all three renderers", () => {
    const def = TEMPLATES.weekly_digest;
    expect(def.id).toBe("weekly_digest");
    expect(typeof def.email.subject).toBe("function");
    expect(typeof def.email.Body).toBe("function");
    expect(typeof def.email.text).toBe("function");
  });

  it("has no WhatsApp renderer yet — it must report skipped, not fail", () => {
    // No verified Meta number exists; a template with no renderer for a channel
    // degrades to `skipped` by design (see the registry header).
    expect(TEMPLATES.weekly_digest.whatsapp).toBeUndefined();
  });
});

describe("weekly digest — subject", () => {
  it("carries the period in both scripts", () => {
    expect(weeklyDigestSubject("ar", base)).toContain("2026-08-03");
    expect(weeklyDigestSubject("ar", base)).toContain("ملخص الأسبوع");
    expect(weeklyDigestSubject("en", base)).toContain("Your week");
  });

  it("does not leak a figure into the subject line", () => {
    // Subjects show in notification previews on a lock screen. The week's
    // revenue is not something to display to whoever picks up the phone.
    const s = weeklyDigestSubject("ar", base);
    expect(s).not.toContain("3450");
    expect(s).not.toContain("345");
  });
});

describe("weekly digest — plain text part", () => {
  it("formats money from piasters, never raw", () => {
    const txt = weeklyDigestText("en", base);
    expect(txt).toContain("3,450.00");
    expect(txt).not.toContain("345000");
  });

  it("includes attendance, session count and the link", () => {
    const txt = weeklyDigestText("en", base);
    expect(txt).toContain("92%");
    expect(txt).toContain("14");
    expect(txt).toContain(base.link);
  });

  it("says nothing is pending when there are no gaps", () => {
    expect(weeklyDigestText("ar", base)).toContain("لا شيء معلّق");
    expect(weeklyDigestText("en", base)).toMatch(/nothing outstanding/i);
  });

  it("names the gap count when there are gaps", () => {
    const txt = weeklyDigestText("en", { ...base, gapsCount: 3 });
    expect(txt).toMatch(/attention: 3/i);
    expect(txt).not.toMatch(/nothing outstanding/i);
  });

  it("a quiet week is stated in words, not as a wall of zeros", () => {
    // All-zero figures read as a broken report. "Nothing happened" is itself
    // information and has to be said.
    const quiet = weeklyDigestText("ar", {
      ...base,
      revenuePiasters: 0,
      expensesPiasters: 0,
      netPiasters: 0,
      sessionsCount: 0,
      attendanceRatePct: 0,
    });
    expect(quiet).toContain("أسبوع بلا حركة");
    expect(quiet).not.toContain("0%");
  });

  it("still reports a week that had sessions but no revenue", () => {
    // Not quiet — lessons ran and nobody paid, which is the opposite of
    // nothing happening and must not be summarised away.
    const txt = weeklyDigestText("en", { ...base, revenuePiasters: 0, netPiasters: -120_000 });
    expect(txt).not.toMatch(/quiet week/i);
    // A loss must arrive AS a loss. Asserted on the digits plus a minus rather
    // than a fixed string, because Intl puts the sign either side of the
    // currency depending on locale — and pinning the wrong one here would make
    // the test, not the email, the thing that has to be right.
    expect(txt).toContain("1,200.00");
    expect(txt).toMatch(/-\s?(EGP|E£)?\s?1,200\.00|\(EGP\s?1,200\.00\)/);
  });

  it("omits the CTA line when there is no link", () => {
    const txt = weeklyDigestText("en", { ...base, link: null });
    expect(txt).not.toMatch(/open reports/i);
  });

  it("carries no token or figure in the link", () => {
    const txt = weeklyDigestText("en", base);
    const url = txt.split("\n").find((l) => l.includes("http")) ?? "";
    expect(url).not.toMatch(/token|secret|[?&]t=/i);
  });
});

describe("weekly digest — html body renders", () => {
  it("builds an element for both locales without throwing", () => {
    for (const locale of ["ar", "en"] as const) {
      const el = WeeklyDigestEmail({ locale, data: base });
      expect(el).toBeTruthy();
    }
  });

  it("renders the quiet-week variant too", () => {
    expect(
      WeeklyDigestEmail({
        locale: "ar",
        data: { ...base, revenuePiasters: 0, sessionsCount: 0 },
      }),
    ).toBeTruthy();
  });
});
