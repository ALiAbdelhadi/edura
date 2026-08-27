import { describe, expect, it } from "vitest";
import {
  ALLOWED_PROPERTIES,
  ANALYTICS_EVENTS,
  IGNORED_ERRORS,
  REDACTED,
  REDACTED_PARAM,
  isMinorRole,
  observabilityIdentity,
  redactDeep,
  redactText,
  redactUrl,
  sanitizeProperties,
  scrubBreadcrumb,
  scrubEvent,
  sharedSentryOptions,
} from "@repo/observability";

describe("identity: who may be identified", () => {
  it("a student is ALWAYS a minor for analytics — no DOB lookup, no exceptions", () => {
    expect(isMinorRole("student")).toBe(true);
    expect(observabilityIdentity({ id: "u1", role: "student" })).toBeNull();
    expect(observabilityIdentity({ id: "u1", role: "student", centerId: "c1" })).toBeNull();
  });

  it("adult roles are identified by ID, role and centerId — and nothing else", () => {
    const identity = observabilityIdentity({ id: "u2", role: "center_admin", centerId: "c1" });
    expect(identity).toEqual({ id: "u2", role: "center_admin", centerId: "c1" });
    expect(Object.keys(identity ?? {}).sort()).toEqual(["centerId", "id", "role"]);
  });

  it("every non-student role is identifiable; every one of them is an adult", () => {
    for (const role of [
      "parent",
      "teacher",
      "assistant",
      "center_admin",
      "center_staff",
      "super_admin",
      "accountant",
    ]) {
      expect(isMinorRole(role)).toBe(false);
      expect(observabilityIdentity({ id: "u", role })).not.toBeNull();
    }
  });

  it("a missing or malformed session yields no identity, never a partial one", () => {
    expect(observabilityIdentity(null)).toBeNull();
    expect(observabilityIdentity(undefined)).toBeNull();
    expect(observabilityIdentity({ id: "", role: "teacher" })).toBeNull();
    expect(observabilityIdentity({ id: "u", role: "" })).toBeNull();
  });

  it("an UNKNOWN role is identified, which is why isMinorRole must stay a denylist of one", () => {
    expect(observabilityIdentity({ id: "u", role: "future_role" })).not.toBeNull();
  });
});

describe("redaction: tokens never leave the process", () => {
  it("strips the claim/reset/onboarding token out of a URL, keeping the path", () => {
    const url = "https://edura.test/ar/onboarding?token=LIVE-SINGLE-USE-TOKEN&ref=x";
    const out = redactUrl(url);
    expect(out).not.toContain("LIVE-SINGLE-USE-TOKEN");
    expect(out).toContain(REDACTED_PARAM);
    expect(out).not.toContain("%5B");
    expect(out).toContain("/ar/onboarding");
    expect(out).toContain("ref=x");
  });

  it("handles relative paths without turning them absolute", () => {
    const out = redactUrl("/ar/reset-password?token=abc123");
    expect(out.startsWith("/ar/reset-password")).toBe(true);
    expect(out).not.toContain("abc123");
  });

  it("redacts every sensitive parameter name, not just `token`", () => {
    for (const key of ["access_token", "code", "secret", "password", "hmac", "email", "otp"]) {
      const out = redactUrl(`/x?${key}=SENSITIVE`);
      expect(out, key).not.toContain("SENSITIVE");
    }
  });

  it("redacts emails and Egyptian phone numbers in free text", () => {
    const text = "failed for parent@example.com / 01012345678 and +201112223334";
    const out = redactText(text);
    expect(out).not.toContain("parent@example.com");
    expect(out).not.toContain("01012345678");
    expect(out).not.toContain("201112223334");
  });

  it("redacts a token embedded in an error message, not only in a URL", () => {
    expect(redactText('claim failed: token="abc.def.ghi"')).not.toContain("abc.def.ghi");
    expect(redactText("password: hunter2")).not.toContain("hunter2");
  });

  it("redacts by KEY inside nested structures", () => {
    const out = redactDeep({
      ok: true,
      nested: { token: "SECRET", user: { email: "a@b.com" } },
    }) as Record<string, { token: string; user: { email: string } }>;
    expect(out.nested.token).toBe(REDACTED);
    expect(out.nested.user.email).toBe(REDACTED);
  });

  it("is depth-bounded, so a pathological payload cannot hang beforeSend", () => {
    let deep: Record<string, unknown> = { token: "SECRET" };
    for (let i = 0; i < 40; i++) deep = { child: deep };
    expect(() => redactDeep(deep)).not.toThrow();
  });
});

describe("sentry: beforeSend is the last gate", () => {
  it("deletes cookies, headers and request bodies outright", () => {
    const event = scrubEvent({
      request: {
        url: "https://edura.test/x?token=LIVE",
        headers: { cookie: "edura.session_token=abc" },
        cookies: { "edura.session_token": "abc" },
        data: { password: "hunter2", name: "أحمد" },
      },
    });
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.headers).toBeUndefined();
    expect(event?.request?.data).toBeUndefined();
    expect(event?.request?.url).not.toContain("LIVE");
  });

  it("strips a user object down to the id, whatever put it there", () => {
    const event = scrubEvent({
      user: { id: "u1", email: "parent@example.com", username: "أحمد", ip_address: "1.2.3.4" },
    });
    expect(event?.user).toEqual({ id: "u1" });
  });

  it("drops the user entirely when there is no id", () => {
    const event = scrubEvent({ user: { email: "a@b.com" } });
    expect(event?.user).toBeNull();
  });

  it("redacts the EXCEPTION VALUE — where captureException actually puts the text", () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "claim failed for https://edura.app/ar/onboarding?token=SECRET123&x=1",
          },
        ],
      },
    });
    const v = out?.exception?.values?.[0]?.value ?? "";
    expect(v).not.toContain("SECRET123");
    expect(v).toContain("[redacted]");
    expect(v).toContain("/ar/onboarding");
  });

  it("redacts an email in an exception value — the sendMail failure shape", () => {
    const out = scrubEvent({
      exception: {
        values: [{ type: "Error", value: "delivery to parent@example.com failed: 550" }],
      },
    });
    expect(out?.exception?.values?.[0]?.value).not.toContain("parent@example.com");
  });

  it("redacts every value in a chained exception, not just the first", () => {
    const out = scrubEvent({
      exception: {
        values: [
          { type: "Error", value: "outer token=AAA111" },
          { type: "PrismaError", value: "inner guardian@example.com" },
        ],
      },
    });
    expect(out?.exception?.values?.[0]?.value).not.toContain("AAA111");
    expect(out?.exception?.values?.[1]?.value).not.toContain("guardian@example.com");
  });

  it("redacts logentry.message — captureMessage's structured form", () => {
    const out = scrubEvent({ logentry: { message: "reset for parent@example.com" } });
    expect(out?.logentry?.message).not.toContain("parent@example.com");
  });

  it("redacts contexts, which SDK integrations write into freely", () => {
    const out = scrubEvent({
      contexts: { extra: { guardianEmail: "guardian@example.com" }, trace: { op: "http" } },
    });
    expect(JSON.stringify(out?.contexts)).not.toContain("guardian@example.com");
  });

  it("survives an exception object with no values array", () => {
    expect(() => scrubEvent({ exception: {} })).not.toThrow();
    expect(() => scrubEvent({ exception: { values: [] } })).not.toThrow();
    expect(() => scrubEvent({ exception: { values: [{ type: "E" }] } })).not.toThrow();
  });

  it("redacts messages, extras and breadcrumb URLs", () => {
    const event = scrubEvent({
      message: "reset failed for parent@example.com",
      extra: { link: "https://edura.test/r?token=LIVE" },
      breadcrumbs: [{ data: { url: "/ar/onboarding?token=LIVE" } }],
    });
    expect(event?.message).not.toContain("parent@example.com");
    expect(JSON.stringify(event?.extra)).not.toContain("LIVE");
    expect(JSON.stringify(event?.breadcrumbs)).not.toContain("LIVE");
  });

  it("scrubs navigation breadcrumbs on the from/to keys too", () => {
    const crumb = scrubBreadcrumb({
      data: { from: "/ar/x?token=LIVE1", to: "/ar/y?token=LIVE2" },
    });
    expect(JSON.stringify(crumb)).not.toContain("LIVE1");
    expect(JSON.stringify(crumb)).not.toContain("LIVE2");
  });

  it("filters Next's control-flow throws, which would otherwise drown the alerts", () => {
    expect(IGNORED_ERRORS).toContain("NEXT_REDIRECT");
    expect(IGNORED_ERRORS).toContain("NEXT_NOT_FOUND");
  });
});

describe("sentry: options posture", () => {
  it("never sends default PII, in any runtime", () => {
    for (const runtime of ["client", "server", "edge"] as const) {
      expect(sharedSentryOptions(runtime).sendDefaultPii).toBe(false);
    }
  });

  it("is disabled when no DSN is configured — the default everywhere local", () => {
    const original = { pub: process.env.NEXT_PUBLIC_SENTRY_DSN, priv: process.env.SENTRY_DSN };
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    try {
      const opts = sharedSentryOptions("server");
      expect(opts.enabled).toBe(false);
      expect(opts.dsn).toBe("");
    } finally {
      if (original.pub) process.env.NEXT_PUBLIC_SENTRY_DSN = original.pub;
      if (original.priv) process.env.SENTRY_DSN = original.priv;
    }
  });

  it("only the client runtime gets denyUrls (browser extensions are not our code)", () => {
    expect(sharedSentryOptions("client").denyUrls).toBeDefined();
    expect(sharedSentryOptions("server").denyUrls).toBeUndefined();
  });
});

describe("analytics: the funnel is a closed set", () => {
  it("event names are snake_case and unique — three spellings would split the funnel", () => {
    const names = Object.values(ANALYTICS_EVENTS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("covers every step the funnel needs", () => {
    expect(Object.values(ANALYTICS_EVENTS)).toEqual(
      expect.arrayContaining([
        "landing_cta_clicked",
        "signup_completed",
        "first_teacher_added",
        "first_group_created",
        "first_student_added",
        "first_payment_completed",
      ]),
    );
  });

  it("properties are an ALLOWLIST — a careless spread cannot leak a name", () => {
    const out = sanitizeProperties({
      role: "center_admin",
      amount_piasters: 45000,
      name: "أحمد محمود",
      email: "parent@example.com",
      phone: "01012345678",
      student_name: "child",
    });
    expect(out).toEqual({ role: "center_admin", amount_piasters: 45000 });
  });

  it("drops null and undefined rather than sending empty properties", () => {
    expect(sanitizeProperties({ role: "teacher", center_id: undefined })).toEqual({
      role: "teacher",
    });
  });

  it("the allowlist itself contains no free-text or identity field", () => {
    for (const banned of ["name", "email", "phone", "student_name", "title", "address"]) {
      expect(ALLOWED_PROPERTIES.has(banned), banned).toBe(false);
    }
  });
});
