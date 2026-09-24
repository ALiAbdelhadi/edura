import { beforeEach, describe, expect, it, vi } from "vitest";

const expired = vi.hoisted(() => [] as Array<{ tag: string; profile: unknown }>);
const failNext = vi.hoisted(() => ({ on: false }));
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string, profile: unknown) => {
    if (failNext.on) throw new Error("no request scope");
    expired.push({ tag, profile });
  },
}));

import { invalidatePublicData, invalidatesPublicData } from "@/lib/cache/public-data";
import { datasetsForAuditTarget, PUBLIC_DATA_TAGS } from "@repo/server-core/cache/public-data";

describe("invalidatesPublicData", () => {
  beforeEach(() => {
    expired.length = 0;
    failNext.on = false;
  });

  it("expires discovery and public profiles after a successful write", async () => {
    const res = await invalidatesPublicData(async () => new Response(null, { status: 200 }))();
    expect(res.status).toBe(200);
    expect(expired).toEqual([
      { tag: "discovery", profile: { expire: 0 } },
      { tag: "public-profile", profile: { expire: 0 } },
    ]);
  });

  it("expires nothing when the write failed", async () => {
    for (const status of [400, 403, 404, 409, 500]) {
      await invalidatesPublicData(async () => new Response(null, { status }))();
    }
    expect(expired).toEqual([]);
  });

  it("invalidates only after the handler has finished — after its commit", async () => {
    const order: string[] = [];
    await invalidatesPublicData(async () => {
      await Promise.resolve();
      order.push("handler-done");
      return new Response(null, { status: 200 });
    })();
    order.push(`expired-${expired.length}`);
    expect(order).toEqual(["handler-done", "expired-2"]);
  });

  it("never fails a committed write because a cache could not be told", async () => {
    failNext.on = true;
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
