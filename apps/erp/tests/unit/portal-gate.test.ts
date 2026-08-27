import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const getSessionUser = vi.fn<() => Promise<SessionUser | null>>();
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: () => getSessionUser(),
  requireSession: vi.fn(),
}));

const isOnboardingComplete = vi.fn<(u: SessionUser) => Promise<boolean>>();
vi.mock("@/lib/services/catalog/onboarding", () => ({
  isOnboardingComplete: (u: SessionUser) => isOnboardingComplete(u),
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

const { requirePortal, resolvePortalEntry } = await import("@/lib/auth/portal-gate");

const user = (role: SessionUser["role"], extra: Partial<SessionUser> = {}): SessionUser => ({
  id: "u-1",
  role,
  locale: "ar",
  ...extra,
});

async function gate(role: Parameters<typeof requirePortal>[0]): Promise<string> {
  try {
    await requirePortal(role, "ar");
    return "";
  } catch (e) {
    if (e instanceof RedirectSignal) return e.target;
    throw e;
  }
}

beforeEach(() => {
  getSessionUser.mockReset();
  isOnboardingComplete.mockReset();
  isOnboardingComplete.mockResolvedValue(true);
});

describe("requirePortal", () => {
  it("sends a signed-out visitor to login, without asking about onboarding", async () => {
    getSessionUser.mockResolvedValue(null);
    expect(await gate("student")).toBe("/ar/login");
    expect(isOnboardingComplete).not.toHaveBeenCalled();
  });

  it("sends a role www does not host to login rather than guessing a portal", async () => {
    getSessionUser.mockResolvedValue(user("super_admin"));
    expect(await gate("student")).toBe("/ar/login");
    expect(isOnboardingComplete).not.toHaveBeenCalled();
  });

  it("sends a mismatched identity to ITS OWN portal, in one hop", async () => {
    getSessionUser.mockResolvedValue(user("parent"));
    expect(await gate("student")).toBe("/ar/dashboard/parent");
  });

  it("sends an unfinished student to the wizard instead of drawing the portal", async () => {
    getSessionUser.mockResolvedValue(user("student"));
    isOnboardingComplete.mockResolvedValue(false);
    expect(await gate("student")).toBe("/ar/onboarding");
  });

  it("lets a finished student through", async () => {
    getSessionUser.mockResolvedValue(user("student"));
    expect(await gate("student")).toBe("");
  });

  it("keeps the locale it was given", async () => {
    getSessionUser.mockResolvedValue(null);
    try {
      await requirePortal("student", "en");
    } catch (e) {
      expect((e as RedirectSignal).target).toBe("/en/login");
    }
  });
});

describe("resolvePortalEntry", () => {
  it("routes each hosted role to its own portal", async () => {
    for (const [role, portal] of [
      ["center_admin", "/ar/dashboard/admin"],
      ["center_staff", "/ar/dashboard/staff"],
      ["teacher", "/ar/dashboard/teacher"],
      ["assistant", "/ar/dashboard/assistant"],
      ["student", "/ar/dashboard/student"],
      ["parent", "/ar/dashboard/parent"],
    ] as const) {
      getSessionUser.mockResolvedValue(user(role));
      expect(await resolvePortalEntry("ar")).toBe(portal);
    }
  });

  it("sends an unfinished user to the wizard, not to a portal that would bounce them", async () => {
    getSessionUser.mockResolvedValue(user("teacher"));
    isOnboardingComplete.mockResolvedValue(false);
    expect(await resolvePortalEntry("ar")).toBe("/ar/onboarding");
  });

  it("sends signed-out and back-office callers to login", async () => {
    getSessionUser.mockResolvedValue(null);
    expect(await resolvePortalEntry("ar")).toBe("/ar/login");
    getSessionUser.mockResolvedValue(user("accountant"));
    expect(await resolvePortalEntry("ar")).toBe("/ar/login");
  });
});
