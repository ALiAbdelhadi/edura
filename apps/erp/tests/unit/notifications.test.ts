import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TEMPLATE_IDS,
  formatEgp,
  normalizeLocale,
  registerChannel,
  renderEmail,
  send,
  type ChannelResult,
  type NotificationChannel,
  type TemplateData,
  type TemplateId,
} from "@repo/notifications";

// =============================================================================
// @repo/notifications — the notification layer's unit proofs.
//
// Everything here is pure: no SMTP, no DB, no network. The email channel is
// exercised through the dispatcher with NOTIFICATION_CHANNELS unset (email on)
// and MAIL_PROVIDER left at its `console` default, which delivers nothing.
// =============================================================================

const LOCALES = ["ar", "en"] as const;

/** One valid payload per template, so the render sweep can be exhaustive. */
const FIXTURES: { [K in TemplateId]: TemplateData<K> } = {
  welcome: {
    name: "أحمد",
    link: "https://edura.test/ar/onboarding?token=TOKEN",
    studentCode: "ABCD1234EFGH",
    expiryDays: 7,
  },
  password_reset: {
    link: "https://edura.test/ar/reset-password?token=TOKEN",
    expiryHours: 1,
  },
  email_verification: {
    link: "https://edura.test/ar/verify?token=TOKEN",
    expiryHours: 1,
  },
  payment_receipt: {
    receiptNumber: "RCP-NILE-2026-00042",
    amountPiasters: 45000,
    description: "اشتراك شهري — الرياضيات",
    payeeName: "مركز النيل",
    method: "card",
    paidAt: new Date("2026-08-02T15:30:00Z"),
    link: "https://edura.test/ar/dashboard",
  },
  guardian_verification: {
    studentName: "لينا حسن",
    link: "https://edura.test/ar/guardian/verify?token=TOKEN",
    expiryDays: 7,
  },
  weekly_digest: {
    centerName: "مركز النيل",
    periodStart: "2026-08-02",
    periodEnd: "2026-08-08",
    revenuePiasters: 345000,
    expensesPiasters: 120000,
    netPiasters: 225000,
    attendanceRatePct: 92,
    sessionsCount: 14,
    gapsCount: 2,
    link: "https://edura.test/ar/dashboard/admin/reports",
  },
};

function fixture<T extends TemplateId>(id: T): TemplateData<T> {
  return FIXTURES[id];
}

describe("templates: every template renders in both languages", () => {
  it("covers every registered template — no fixture drift", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...TEMPLATE_IDS].sort());
  });

  for (const id of TEMPLATE_IDS) {
    for (const locale of LOCALES) {
      it(`${id} / ${locale} produces a subject, HTML and plain text`, async () => {
        const out = await renderEmail(id, locale, fixture(id));

        expect(out.subject.trim().length).toBeGreaterThan(0);
        expect(out.html).toContain("<html");
        // A missing text/plain alternative is a strong spam signal — every
        // template writes its own rather than having tags stripped off it.
        expect(out.text.trim().length).toBeGreaterThan(0);

        // Direction is the whole point of shipping ar first.
        expect(out.html).toContain(locale === "ar" ? 'dir="rtl"' : 'dir="ltr"');
        expect(out.html).toContain(`lang="${locale}"`);
      });
    }
  }
});

describe("templates: RTL and localization are real, not decorative", () => {
  it("Arabic renders Arabic copy and English renders English copy", async () => {
    const ar = await renderEmail("password_reset", "ar", fixture("password_reset"));
    const en = await renderEmail("password_reset", "en", fixture("password_reset"));

    expect(ar.subject).toMatch(/[؀-ۿ]/);
    expect(en.subject).not.toMatch(/[؀-ۿ]/);
    expect(ar.subject).not.toEqual(en.subject);
  });

  it("an unknown or missing locale falls back to Arabic, never English", async () => {
    for (const value of [null, undefined, "", "fr", "ar-EG"]) {
      expect(normalizeLocale(value)).toBe("ar");
    }
    const out = await renderEmail("welcome", null, fixture("welcome"));
    expect(out.html).toContain('dir="rtl"');
  });

  it("money is formatted from piasters, so the email cannot disagree with the screen", () => {
    // 45000 piasters = 450.00 EGP. Locale changes the digits, never the value.
    expect(formatEgp(45000, "en")).toContain("450.00");
    expect(formatEgp(45000, "ar")).toMatch(/٤٥٠|450/);
    expect(formatEgp(0, "en")).toContain("0.00");
  });
});

describe("templates: user data is escaped", () => {
  it("a name containing markup never reaches the HTML unescaped", async () => {
    const out = await renderEmail("welcome", "en", {
      ...fixture("welcome"),
      name: '<script>alert("xss")</script>',
    });
    expect(out.html).not.toContain("<script>alert");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("a description containing markup is escaped in the receipt", async () => {
    const out = await renderEmail("payment_receipt", "en", {
      ...fixture("payment_receipt"),
      description: '<img src=x onerror="steal()">',
    });
    expect(out.html).not.toContain('onerror="steal()"');
  });
});

// -----------------------------------------------------------------------------
// The dispatcher
// -----------------------------------------------------------------------------

/** A synthetic channel — this is the "WhatsApp plugs in" proof. */
function spyChannel(overrides: Partial<NotificationChannel> = {}) {
  const calls: { template: TemplateId }[] = [];
  const channel: NotificationChannel = {
    // Borrows the `whatsapp` id: it is already in the ChannelId union but has
    // no implementation, so it is exactly the "a channel that does not exist
    // yet" case this proof is about.
    id: "whatsapp",
    isEnabled: () => true,
    supports: () => true,
    async send(template): Promise<ChannelResult> {
      calls.push({ template });
      return { channel: "whatsapp", status: "sent", messageId: "stub-1" };
    },
    ...overrides,
  };
  return { channel, calls };
}

describe("dispatcher: channels are pluggable", () => {
  let unregister: (() => void) | null = null;

  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("a newly registered channel receives the fan-out with NO dispatcher change", async () => {
    const { channel, calls } = spyChannel();
    unregister = registerChannel(channel);

    const res = await send("welcome", { email: "a@b.test" }, fixture("welcome"));

    expect(calls).toEqual([{ template: "welcome" }]);
    expect(res.results.find((r) => r.channel === "whatsapp")).toMatchObject({
      status: "sent",
      messageId: "stub-1",
    });
    // The email channel still ran alongside it — registration is additive.
    expect(res.results.some((r) => r.channel === "email")).toBe(true);
  });

  it("unregistering removes it again — no leakage between suites", async () => {
    const { channel, calls } = spyChannel();
    const off = registerChannel(channel);
    off();

    await send("welcome", { email: "a@b.test" }, fixture("welcome"));
    expect(calls).toEqual([]);
  });

  it("a disabled channel reports `skipped`, never `failed`", async () => {
    const { channel, calls } = spyChannel({ isEnabled: () => false });
    unregister = registerChannel(channel);

    const res = await send("welcome", { email: "a@b.test" }, fixture("welcome"));
    expect(calls).toEqual([]);
    expect(res.results.find((r) => r.channel === "whatsapp")?.status).toBe("skipped");
  });

  it("a channel that does not support the template reports `skipped`", async () => {
    const { channel, calls } = spyChannel({ supports: () => false });
    unregister = registerChannel(channel);

    const res = await send("welcome", { email: "a@b.test" }, fixture("welcome"));
    expect(calls).toEqual([]);
    expect(res.results.find((r) => r.channel === "whatsapp")?.status).toBe("skipped");
  });

  it("`channels` narrows the fan-out to the named channels only", async () => {
    const { channel, calls } = spyChannel();
    unregister = registerChannel(channel);

    const res = await send("welcome", { email: "a@b.test" }, fixture("welcome"), {
      channels: ["email"],
    });
    expect(calls).toEqual([]);
    expect(res.results.map((r) => r.channel)).toEqual(["email"]);
  });
});

describe("dispatcher: it never throws", () => {
  let unregister: (() => void) | null = null;
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("a channel that breaks its never-throws contract is contained", async () => {
    const { channel } = spyChannel({
      send: async () => {
        throw new Error("boom");
      },
    });
    unregister = registerChannel(channel);

    const res = await send("welcome", { email: "a@b.test" }, fixture("welcome"));
    const wa = res.results.find((r) => r.channel === "whatsapp");
    expect(wa?.status).toBe("failed");
    expect(wa?.error).toBe("boom");
    // The other channels still ran.
    expect(res.results.some((r) => r.channel === "email")).toBe(true);
  });

  it("a recipient with no address is `no_recipient`, not `failed`", async () => {
    const res = await send("welcome", { email: null }, fixture("welcome"));
    expect(res.results.find((r) => r.channel === "email")?.status).toBe("no_recipient");
    expect(res.delivered).toBe(false);
  });

  it("a render failure is reported, not thrown", async () => {
    const res = await send(
      "payment_receipt",
      { email: "a@b.test" },
      // paidAt is required to be a Date; a malformed payload must not escape
      // the channel as an exception.
      { ...fixture("payment_receipt"), paidAt: "not-a-date" as unknown as Date },
    );
    expect(res.results.find((r) => r.channel === "email")?.status).toBe("failed");
    expect(res.delivered).toBe(false);
  });
});

describe("email channel: the console default delivers nothing", () => {
  const original = process.env.MAIL_PROVIDER;
  beforeEach(() => {
    delete process.env.MAIL_PROVIDER;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MAIL_PROVIDER;
    else process.env.MAIL_PROVIDER = original;
  });

  it("reports `skipped` rather than `sent` — a dev run must never claim delivery", async () => {
    const res = await send("welcome", { email: "a@b.test" }, fixture("welcome"));
    const email = res.results.find((r) => r.channel === "email");
    expect(email?.status).toBe("skipped");
    expect(email?.error).toBeUndefined();
    expect(res.delivered).toBe(false);
  });
});
