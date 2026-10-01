import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { nextRoute, paramsFromPattern, type NextRouteParams } from "../../src/next-route";

// The adapter must hand a moved route module exactly what Next hands it:
// `(req, { params: Promise<...> })`, one decoded string per `[name]` segment
// and a decoded string[] for `[...name]`.

function echoApp() {
  const app = new Hono();
  const echo = nextRoute(async (req, ctx) =>
    Response.json({ url: req.url, method: req.method, params: await ctx.params }),
  );
  app.get("/api/v1/centers/:id", echo);
  app.get("/api/v1/centers/:id/rooms/:roomId", echo);
  app.all("/api/auth/:all{.+}", echo);
  app.get("/api/v1/docs", echo);
  app.get("/api/v1/docs/:slug{.+}", echo);
  return app;
}

async function call(app: Hono, path: string, method = "GET") {
  const res = await app.request(`http://localhost${path}`, { method });
  return (await res.json()) as { url: string; method: string; params: NextRouteParams };
}

describe("nextRoute", () => {
  it("passes the raw Request through and resolves a single dynamic segment", async () => {
    const body = await call(echoApp(), "/api/v1/centers/abc-123?x=1");
    expect(body.url).toBe("http://localhost/api/v1/centers/abc-123?x=1");
    expect(body.method).toBe("GET");
    expect(body.params).toEqual({ id: "abc-123" });
  });

  it("resolves several segments by name", async () => {
    const body = await call(echoApp(), "/api/v1/centers/c1/rooms/r9");
    expect(body.params).toEqual({ id: "c1", roomId: "r9" });
  });

  it("decodes each segment on its own, like Next", async () => {
    const body = await call(echoApp(), "/api/v1/centers/a%20b%2Fc");
    expect(body.params).toEqual({ id: "a b/c" });
  });

  it("gives a catch-all as a string[] of decoded segments", async () => {
    const body = await call(echoApp(), "/api/auth/sign-in/email", "POST");
    expect(body.method).toBe("POST");
    expect(body.params).toEqual({ all: ["sign-in", "email"] });
    const one = await call(echoApp(), "/api/auth/get-session");
    expect(one.params).toEqual({ all: ["get-session"] });
    const enc = await call(echoApp(), "/api/auth/a%2Fb/c%20d");
    expect(enc.params).toEqual({ all: ["a/b", "c d"] });
  });

  it("an optional catch-all is two registrations: bare path gives {} and the rest a string[]", async () => {
    expect((await call(echoApp(), "/api/v1/docs")).params).toEqual({});
    expect((await call(echoApp(), "/api/v1/docs/a/b")).params).toEqual({ slug: ["a", "b"] });
  });

  it("paramsFromPattern keeps a malformed escape as-is instead of throwing", () => {
    expect(paramsFromPattern("/x/:id", "/x/%E0%A4%A")).toEqual({ id: "%E0%A4%A" });
  });
});
