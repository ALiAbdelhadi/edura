import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";
import type { SsrSession } from "@/lib/server/ssr-session";

// The gate reads ONE service route; the session's null rules and the
// onboarding answer are the service's (R5), so the gate only routes on them.
const serviceGet = vi.fn<(path: string) => Promise<{ status: number; data: SsrSession | null }>>();
vi.mock("@/lib/server/service-fetch", () => ({
  serviceGet: (path: string) => serviceGet(path),
  ServiceError: class extends Error {},
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

function session(u: SessionUser | null, onboardingComplete = Boolean(u)) {
  serviceGet.mockResolvedValue({ status: 200, data: { user: u, onboardingComplete, viewAs: null } });
}

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
  serviceGet.mockReset();
});

describe("requirePortal", () => {
  it("reads the one ssr-session route and nothing else", async () => {
    session(user("student"));
    await gate("student");
    expect(serviceGet.mock.calls.map((c) => c[0])).toEqual(["/api/v1/me/ssr-session"]);
  });

  it("sends a signed-out visitor to login", async () => {
    session(null);
    expect(await gate("student")).toBe("/ar/login");
  });

  it("sends a role www does not host to login rather than guessing a portal", async () => {
    session(user("super_admin"));
    expect(await gate("student")).toBe("/ar/login");
  });

  it("sends a mismatched identity to ITS OWN portal, in one hop", async () => {
    session(user("parent"));
    expect(await gate("student")).toBe("/ar/dashboard/parent");
  });

  it("sends an unfinished student to the wizard instead of drawing the portal", async () => {
    session(user("student"), false);
    expect(await gate("student")).toBe("/ar/onboarding");
  });

  it("lets a finished student through", async () => {
    session(user("student"));
    expect(await gate("student")).toBe("");
  });

  it("keeps the locale it was given", async () => {
    session(null);
    try {
      await requirePortal("student", "en");
    } catch (e) {
      expect((e as RedirectSignal).target).toBe("/en/login");
    }
  });

  it("treats a service without a body as an outage, not a signed-out visitor", async () => {
    serviceGet.mockResolvedValue({ status: 200, data: null });
    await expect(requirePortal("student", "ar")).rejects.toThrow(/ssr-session/);
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
      session(user(role));
      expect(await resolvePortalEntry("ar")).toBe(portal);
    }
  });

  it("sends an unfinished user to the wizard, not to a portal that would bounce them", async () => {
    session(user("teacher"), false);
    expect(await resolvePortalEntry("ar")).toBe("/ar/onboarding");
  });

  it("sends signed-out and back-office callers to login", async () => {
    session(null);
    expect(await resolvePortalEntry("ar")).toBe("/ar/login");
    session(user("accountant"));
    expect(await resolvePortalEntry("ar")).toBe("/ar/login");
  });
});
