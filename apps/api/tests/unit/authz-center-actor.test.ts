import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const platformDb = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (...args: unknown[]) => platformDb(...(args as [])),
}));
vi.mock("@repo/server-core/erp-auth/session", () => ({}));

const {
  authorizeCenterActor,
  assertCenterActorMethodAllowed,
  RECEPTION,
  MANAGER,
  ACCOUNTANT,
} = await import("@repo/server-core/authz/center-actor");
const { ForbiddenError } = await import("@repo/server-core/errors/classes");

const owner: SessionUser = {
  id: "owner-1",
  role: "center_admin",
  centerId: "c-1",
  locale: "ar",
  name: "Owner",
  email: "o@x.t",
};
const staff: SessionUser = { id: "staff-1", role: "center_staff", locale: "ar" };

function linkResolvesTo(link: { centerId: string; role: string } | null) {
  platformDb.mockImplementation(async () => link);
}

beforeEach(() => platformDb.mockReset());

describe("authorizeCenterActor — owner (center_admin)", () => {
  it("passes regardless of the route's allow list, without any DB read", async () => {
    const actor = await authorizeCenterActor(owner, { allow: ACCOUNTANT });
    expect(actor.staffRole).toBeNull();
    expect(actor.onBehalfOf).toBeNull();
    expect(platformDb).not.toHaveBeenCalled();
  });

  it("rejects a center_admin with no centerId", async () => {
    await expect(
      authorizeCenterActor({ ...owner, centerId: undefined }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shapes acting as center_admin with the caller's own id (audit fidelity)", async () => {
    const actor = await authorizeCenterActor(owner, { allow: RECEPTION });
    expect(actor.acting).toMatchObject({
      id: "owner-1",
      role: "center_admin",
      centerId: "c-1",
    });
    expect(actor.actorId).toBe("owner-1");
  });
});

describe("authorizeCenterActor — staff sub-role gate", () => {
  it("staff with an allowed preset role passes, scoped to the LINK's center", async () => {
    linkResolvesTo({ centerId: "c-9", role: "receptionist" });
    const actor = await authorizeCenterActor(staff, { allow: RECEPTION });
    expect(actor.staffRole).toBe("receptionist");
    expect(actor.acting).toMatchObject({ role: "center_admin", centerId: "c-9", id: "staff-1" });
    expect(actor.onBehalfOf).toBe("c-9");
  });

  it("staff with a role NOT in allow → 403 (receptionist on a MANAGER route)", async () => {
    linkResolvesTo({ centerId: "c-9", role: "receptionist" });
    await expect(
      authorizeCenterActor(staff, { allow: MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("staff with NO allow list at all → 403 (default-closed)", async () => {
    linkResolvesTo({ centerId: "c-9", role: "manager" });
    await expect(authorizeCenterActor(staff)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no live link (removed/never linked) → 403", async () => {
    linkResolvesTo(null);
    await expect(
      authorizeCenterActor(staff, { allow: RECEPTION }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("any other role → 403 before touching the DB", async () => {
    await expect(
      authorizeCenterActor({ ...staff, role: "teacher" }, { allow: RECEPTION }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(platformDb).not.toHaveBeenCalled();
  });
});

describe("assertCenterActorMethodAllowed — accountant read-only invariant", () => {
  it("center_accountant may GET but never mutate", () => {
    expect(() => assertCenterActorMethodAllowed("center_accountant", "GET")).not.toThrow();
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(() => assertCenterActorMethodAllowed("center_accountant", m)).toThrow(
        ForbiddenError,
      );
    }
  });

  it("manager and owner are unaffected", () => {
    expect(() => assertCenterActorMethodAllowed("manager", "POST")).not.toThrow();
    expect(() => assertCenterActorMethodAllowed(null, "DELETE")).not.toThrow();
  });
});
