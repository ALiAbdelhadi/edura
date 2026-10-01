import { beforeEach, describe, expect, it, vi } from "vitest";

const bumped = vi.hoisted(() => [] as string[]);
const failStore = vi.hoisted(() => ({ on: false }));
vi.mock("@repo/server-core/cache/public-store", () => ({
  bumpPublicDataTag: (tag: string) => {
    if (failStore.on) throw new Error("store unavailable");
    bumped.push(tag);
  },
  closePublicStore: () => {},
}));

import { invalidatePublicData, invalidatesPublicData } from "@repo/server-core/cache/public-data";
import { datasetsForAuditTarget, PUBLIC_DATA_TAGS } from "@repo/server-core/cache/public-data";
import { bindPublicDataCache } from "../../src/cache";

// The service binds the invalidator to the shared store (src/cache.ts); the
// suite runs the same wiring the process runs.
bindPublicDataCache();

describe("invalidatesPublicData", () => {
  beforeEach(() => {
    bumped.length = 0;
    failStore.on = false;
  });

  it("bumps discovery and public profiles in the shared store after a successful write", async () => {
    const res = await invalidatesPublicData(async () => new Response(null, { status: 200 }))();
    expect(res.status).toBe(200);
    expect(bumped).toEqual(["discovery", "public-profile"]);
  });

  it("bumps nothing when the write failed", async () => {
    for (const status of [400, 403, 404, 409, 500]) {
      await invalidatesPublicData(async () => new Response(null, { status }))();
    }
    expect(bumped).toEqual([]);
  });

  it("invalidates only after the handler has finished — after its commit", async () => {
    const order: string[] = [];
    await invalidatesPublicData(async () => {
      await Promise.resolve();
      order.push("handler-done");
      return new Response(null, { status: 200 });
    })();
    order.push(`bumped-${bumped.length}`);
    expect(order).toEqual(["handler-done", "bumped-2"]);
  });

  it("never fails a committed write because a cache could not be told", async () => {
    failStore.on = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => invalidatePublicData("catalog")).not.toThrow();
    const res = await invalidatesPublicData(async () => new Response(null, { status: 201 }))();
    expect(res.status).toBe(201);
    spy.mockRestore();
  });
});

describe("datasetsForAuditTarget", () => {
  it("maps catalog writes to catalog and discovery", () => {
    for (const t of ["subject", "subject_offering", "grade_level", "track", "stage"]) {
      expect(datasetsForAuditTarget(t)).toEqual(["catalog", "discovery"]);
    }
  });

  it("maps centre, course, teacher and user writes to discovery and profiles", () => {
    for (const t of ["center", "course", "teacher", "user", "collaboration_request"]) {
      expect(datasetsForAuditTarget(t)).toEqual(["discovery", "publicProfile"]);
    }
  });

  it("maps a hall write to public profiles only — halls are not in discovery", () => {
    expect(datasetsForAuditTarget("room")).toEqual(["publicProfile"]);
  });

  it("maps money, attendance and everything else to nothing", () => {
    for (const t of ["payment", "payout", "transaction", "session", "enrollment", "subscription", "invoice"]) {
      expect(datasetsForAuditTarget(t)).toEqual([]);
    }
  });

  it("uses the same tag strings the cached readers are stored under", () => {
    expect(PUBLIC_DATA_TAGS).toEqual({
      catalog: "catalog",
      discovery: "discovery",
      publicProfile: "public-profile",
    });
  });
});
