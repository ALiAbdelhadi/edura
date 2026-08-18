import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

/**
 * The app's root, `/{locale}`, after the landing page moved to apps/showcase.
 *
 * Every branch of this file is a redirect, so there is no rendered output to
 * assert on — which is exactly why it is worth a test: the ordering is the
 * behaviour, and the expensive mistake (bouncing a SIGNED-IN user out to a
 * marketing site) is invisible until a real user hits it.
 */

const getSessionUser = vi.fn<() => Promise<SessionUser | null>>();
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: () => getSessionUser(),
  requireSession: vi.fn(),
}));

/**
 * `redirect()` works by THROWING, and the real one throws a framework-internal
 * signal. The mock throws too — not for fidelity, but because a mock that
 * merely records the call would let execution fall through to the next
 * redirect, and the test would assert the last branch instead of the taken one.
 */
class RedirectSignal extends Error {
  constructor(readonly target: string) {
    super(`NEXT_REDIRECT:${target}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new RedirectSignal(target);
  },
}));

const { default: RootPage } = await import("@/app/[locale]/page");
const { marketingSiteUrl } = await import("@/lib/marketing-site");

/** Runs the page and returns where it sent the visitor. */
async function landsOn(locale: string): Promise<string> {
  try {
    await RootPage({ params: Promise.resolve({ locale }) });
  } catch (e) {
    if (e instanceof RedirectSignal) return e.target;
    throw e;
  }
  throw new Error("root page returned without redirecting");
}

const student: SessionUser = { id: "u-1", role: "student", locale: "ar" };

const ORIGINAL = process.env.MARKETING_SITE_URL;
beforeEach(() => {
  getSessionUser.mockReset();
  delete process.env.MARKETING_SITE_URL;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MARKETING_SITE_URL;
  else process.env.MARKETING_SITE_URL = ORIGINAL;
});

describe("root redirect", () => {
  it("sends a signed-in user to their dashboard, not to marketing", async () => {
    process.env.MARKETING_SITE_URL = "https://edura.eg";
    getSessionUser.mockResolvedValue(student);

    // The session check runs FIRST and wins even when marketing is configured:
    // a user who has already converted must never be bounced to the sales site.
    expect(await landsOn("ar")).toBe("/ar/dashboard");
  });

  it("keeps the signed-in user's locale", async () => {
    getSessionUser.mockResolvedValue(student);
    expect(await landsOn("en")).toBe("/en/dashboard");
  });

  it("sends a signed-out visitor to the marketing site, locale preserved", async () => {
    process.env.MARKETING_SITE_URL = "https://edura.eg";
    getSessionUser.mockResolvedValue(null);

    expect(await landsOn("ar")).toBe("https://edura.eg/ar");
    expect(await landsOn("en")).toBe("https://edura.eg/en");
  });

  it("falls back to the app's own login when marketing is unconfigured", async () => {
    getSessionUser.mockResolvedValue(null);
    // Never a dead link: an unconfigured deployment still lands somewhere real.
    expect(await landsOn("ar")).toBe("/ar/login");
  });

  it("does not double the slash when the configured URL has a trailing one", async () => {
    process.env.MARKETING_SITE_URL = "https://edura.eg/";
    getSessionUser.mockResolvedValue(null);
    expect(await landsOn("ar")).toBe("https://edura.eg/ar");
  });
});

describe("marketingSiteUrl", () => {
  it("is null when unset or blank, so callers can fall back", () => {
    expect(marketingSiteUrl()).toBeNull();
    process.env.MARKETING_SITE_URL = "   ";
    expect(marketingSiteUrl()).toBeNull();
  });

  it("refuses a non-http(s) scheme", () => {
    // This value becomes a Location header; `javascript:` must never reach it.
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc"]) {
      process.env.MARKETING_SITE_URL = bad;
      expect(marketingSiteUrl(), bad).toBeNull();
    }
  });

  it("refuses a malformed URL rather than emitting it", () => {
    process.env.MARKETING_SITE_URL = "edura.eg";
    expect(marketingSiteUrl()).toBeNull();
  });

  it("accepts http for local development", () => {
    process.env.MARKETING_SITE_URL = "http://localhost:3006";
    expect(marketingSiteUrl()).toBe("http://localhost:3006");
  });
});
