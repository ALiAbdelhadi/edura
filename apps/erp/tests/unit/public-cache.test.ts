import { describe, expect, it } from "vitest";

import {
  PUBLIC_CACHE,
  publicCacheControl,
  withPublicCache,
} from "@/lib/http/public-cache";
import { fail, ok } from "@/lib/http/envelope";

const cached = (res: Response) => res.headers.get("cache-control");

describe("withPublicCache", () => {
  it("marks a 200 as shared-cacheable and keeps the browser out", async () => {
    const res = await withPublicCache(async () => ok({ a: 1 }), PUBLIC_CACHE.discovery)();
    expect(cached(res)).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=60");
  });

  it("leaves every non-200 at no-store, so one caller's failure is never served to everyone", async () => {
    for (const make of [
      () => fail(404, "not_found", "Not found"),
      () => fail(500, "internal", "Internal error"),
      () => new Response("slow down", { status: 429, headers: { "Cache-Control": "no-store" } }),
      () => ok({ a: 1 }, { status: 201 }),
    ]) {
      const res = await withPublicCache(async () => make(), PUBLIC_CACHE.discovery)();
      expect(cached(res)).toBe("no-store");
    }
  });

  it("never marks a response that sets a cookie", async () => {
    const res = await withPublicCache(async () => {
      const r = ok({ a: 1 });
      r.headers.append("set-cookie", "k=v");
      return r;
    }, PUBLIC_CACHE.discovery)();
    expect(cached(res)).toBe("no-store");
  });

  it("passes the handler's arguments through untouched", async () => {
    const res = await withPublicCache(
      async (_req: Request, ctx: { id: string }) => ok({ id: ctx.id }),
      PUBLIC_CACHE.deployment,
    )(new Request("http://x/"), { id: "abc" });
    expect(await res.json()).toEqual({ data: { id: "abc" } });
    expect(cached(res)).toBe(publicCacheControl(PUBLIC_CACHE.deployment));
  });

  it("keeps browser max-age at zero in every profile", () => {
    for (const p of Object.values(PUBLIC_CACHE)) {
      expect(publicCacheControl(p)).toMatch(/max-age=0,/);
      expect(p.sMaxAge).toBeGreaterThan(0);
    }
  });
});
