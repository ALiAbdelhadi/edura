import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const getSessionUser = vi.fn<() => Promise<SessionUser | null>>();
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: () => getSessionUser(),
  requireSession: vi.fn(),
}));

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
