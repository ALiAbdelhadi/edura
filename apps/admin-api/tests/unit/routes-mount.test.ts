import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { autoImplementMethods, honoPattern, mountRoutes } from "../../src/routes/mount";

describe("honoPattern", () => {
  it("maps Next dynamic segments", () => {
    expect(honoPattern("/api/v1/rooms/[id]/photos")).toBe("/api/v1/rooms/:id/photos");
    expect(honoPattern("/api/auth/[...all]")).toBe("/api/auth/:all{.+}");
    expect(honoPattern("/api/v1/%5Fping")).toBe("/api/v1/%5Fping");
  });
  it("refuses an optional catch-all", () => {
    expect(() => honoPattern("/api/x/[[...rest]]")).toThrow();
  });
});

describe("autoImplementMethods (Next's rules)", () => {
  const GET = () => new Response("get");
  it("HEAD runs GET, OPTIONS lists the sorted methods, others are 405", async () => {
    const m = autoImplementMethods({ GET, POST: GET });
    const ctx = { params: Promise.resolve({}) };
    expect(m.HEAD).toBe(GET);
    const opt = await m.OPTIONS(new Request("http://x"), ctx);
    expect(opt.status).toBe(204);
    expect(opt.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
    const del = await m.DELETE(new Request("http://x"), ctx);
    expect(del.status).toBe(405);
    expect(await del.text()).toBe("");
  });
});

describe("mountRoutes", () => {
  const app = new Hono();
  mountRoutes(app, [
    {
      path: "/api/t/[id]",
      module: {
        GET: async (_req: Request, ctx: { params: Promise<Record<string, string>> }) =>
          Response.json({ via: "GET", ...(await ctx.params) }),
        HEAD: () => new Response(null, { status: 204, headers: { "x-via": "HEAD" } }),
      },
    },
  ]);
  it("serves GET with Next-style params", async () => {
    const res = await app.request("/api/t/a%20b");
    expect(await res.json()).toEqual({ via: "GET", id: "a b" });
  });
  it("routes HEAD to the module's own HEAD", async () => {
    const res = await app.request("/api/t/1", { method: "HEAD" });
    expect(res.status).toBe(204);
    expect(res.headers.get("x-via")).toBe("HEAD");
  });
  it("answers an unexported method with a bare 405", async () => {
    const res = await app.request("/api/t/1", { method: "PATCH" });
    expect(res.status).toBe(405);
  });
});

describe("src/routes/index.ts", () => {
  it("is regenerated from the route files", () => {
    const script = fileURLToPath(new URL("../../scripts/gen-routes.ts", import.meta.url));
    expect(() => execFileSync("bun", [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });

  // Hono answers with the first registered match; Next prefers a fixed segment.
  // A dynamic route listed before a fixed sibling it matches would take its
  // requests (payments/[id] swallowing payments/initiate, found by the parity sweep).
  it("lists no dynamic route ahead of a fixed route it would shadow", () => {
    const index = readFileSync(fileURLToPath(new URL("../../src/routes/index.ts", import.meta.url)), "utf8");
    const paths = [...index.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]!.split("/"));
    const isDynamic = (seg: string) => seg.startsWith("[");
    const shadowed: string[] = [];
    paths.forEach((earlier, i) => {
      for (const later of paths.slice(i + 1)) {
        if (earlier.length !== later.length) continue;
        const matches = earlier.every((seg, k) => seg === later[k] || isDynamic(seg));
        if (matches) shadowed.push(`${earlier.join("/")} shadows ${later.join("/")}`);
      }
    });
    expect(paths.length).toBeGreaterThan(200);
    expect(shadowed).toEqual([]);
  });

  it("the first registered match wins in Hono, which is why order matters", async () => {
    const app = new Hono();
    app.get("/p/:id", (c) => c.text("dynamic"));
    app.get("/p/fixed", (c) => c.text("fixed"));
    expect(await (await app.request("/p/fixed")).text()).toBe("dynamic");
  });
});
