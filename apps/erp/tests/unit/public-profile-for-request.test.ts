import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookie: null as string | null,
  viewer: null as null | { id: string; role: string; centerId?: string },
  shared: { kind: "center", id: "center-1" } as null | { kind: string; id: string },
  fresh: 0,
  sharedReads: 0,
  sessionReads: 0,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.cookie ? { cookie: state.cookie } : {}),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => {
    state.sessionReads++;
    return state.viewer;
  },
}));
vi.mock("@/lib/services/public-handles/public-profiles", () => ({
  resolvePublicProfile: async () => {
    state.fresh++;
    return { kind: "fresh" };
  },
}));
vi.mock("@/lib/services/public-handles/public-profiles-cache", () => ({
  resolvePublicProfileAnonymous: async () => {
    state.sharedReads++;
    return state.shared;
  },
}));

import {
  mayEditProfile,
  publicProfileForRequest,
} from "@/lib/services/public-handles/public-profile-for-request";
import { SESSION_COOKIE_PREFIX } from "@/lib/auth/cookie-prefix";

const session = `${SESSION_COOKIE_PREFIX}.session_token=abc.def`;

async function pathFor() {
  state.fresh = 0;
  state.sharedReads = 0;
  state.sessionReads = 0;
  const out = await publicProfileForRequest("h");
  return (out as { kind: string } | null)?.kind === "fresh" ? "fresh" : "shared";
}

describe("publicProfileForRequest", () => {
  beforeEach(() => {
    state.cookie = null;
    state.viewer = null;
    state.shared = { kind: "center", id: "center-1" };
  });

  it("serves an anonymous visitor from the shared cache without a session query", async () => {
    expect(await pathFor()).toBe("shared");
    expect(state.sessionReads).toBe(0);
  });

  it("treats unrelated cookies as anonymous", async () => {
    state.cookie = "NEXT_LOCALE=ar; theme=dark";
    expect(await pathFor()).toBe("shared");
    expect(state.sessionReads).toBe(0);
  });

  it("serves a signed-in visitor who cannot edit the profile from the shared cache", async () => {
    state.cookie = session;
    state.viewer = { id: "student-1", role: "student" };
    expect(await pathFor()).toBe("shared");
  });

  it("reads fresh for the centre's own admin — an owner always sees their edit", async () => {
    state.cookie = session;
    state.viewer = { id: "admin-1", role: "center_admin", centerId: "center-1" };
    expect(await pathFor()).toBe("fresh");
  });

  it("serves another centre's admin from the shared cache", async () => {
    state.cookie = session;
    state.viewer = { id: "admin-2", role: "center_admin", centerId: "center-2" };
    expect(await pathFor()).toBe("shared");
  });

  it("reads fresh when a session cookie meets a handle the cache says is missing", async () => {
    state.cookie = `__Secure-${session}`;
    state.shared = null;
    expect(await pathFor()).toBe("fresh");
  });

  it("treats a garbage session cookie (no user) as a non-editor", async () => {
    state.cookie = session;
    state.viewer = null;
    expect(await pathFor()).toBe("shared");
  });
});

describe("mayEditProfile", () => {
  const center = { kind: "center", id: "c1" } as never;
  const teacher = { kind: "teacher", id: "t1" } as never;
  const v = (role: string, extra: object = {}) => ({ id: "u", role, ...extra }) as never;

  it("centre: its admin and staff, or a centre role whose centre is unknown", () => {
    expect(mayEditProfile(v("center_admin", { centerId: "c1" }), center)).toBe(true);
    expect(mayEditProfile(v("center_staff", { centerId: "c1" }), center)).toBe(true);
    expect(mayEditProfile(v("center_admin"), center)).toBe(true);
    expect(mayEditProfile(v("center_admin", { centerId: "c2" }), center)).toBe(false);
    expect(mayEditProfile(v("teacher"), center)).toBe(false);
  });

  it("teacher: the teacher, and any assistant", () => {
    expect(mayEditProfile({ id: "t1", role: "teacher" } as never, teacher)).toBe(true);
    expect(mayEditProfile(v("assistant"), teacher)).toBe(true);
    expect(mayEditProfile(v("teacher"), teacher)).toBe(false);
    expect(mayEditProfile(v("parent"), teacher)).toBe(false);
  });
});
