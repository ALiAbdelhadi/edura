import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@repo/server-core/errors/classes";
import { toErrorResponse } from "@repo/server-core/errors/http";
import { runAfter } from "@repo/server-core/http/after";
import { createApp } from "../../src/app";
import { registerAfterScheduler } from "../../src/after";
import { requestIdFrom } from "../../src/middleware/request-id";

afterEach(() => vi.restoreAllMocks());

const app = () => createApp({ proxySecret: () => undefined, accessLog: false });

describe("request id", () => {
  it("keeps a sane inbound x-request-id and echoes it", async () => {
    const res = await app().request("http://localhost/api/v1/nope", {
      headers: { "x-request-id": "abc-123_XYZ.789" },
    });
    expect(res.headers.get("x-request-id")).toBe("abc-123_XYZ.789");
  });

  it("replaces a missing or junk inbound id with a fresh UUID", async () => {
    const res = await app().request("http://localhost/api/v1/nope");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    for (const junk of ["", "short", "has space here", "x".repeat(200), "a\nb-inject-header"]) {
      expect(requestIdFrom(junk)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("envelope parity with the Next apps", () => {
  it("unknown route -> the NotFoundError envelope, no-store, with a request id", async () => {
    const res = await app().request("http://localhost/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "not_found", message: "Not found" } });
    expect(typeof body.error.messageAr === "string" || body.error.messageAr === undefined).toBe(true);
  });

  it("a thrown AppError becomes exactly toErrorResponse's body and status", async () => {
    const a = app();
    a.get("/api/v1/boom", () => {
      throw new ValidationError("Validation failed", { name: ["required"] });
    });
    const res = await a.request("http://localhost/api/v1/boom");
    const expected = toErrorResponse(new ValidationError("Validation failed", { name: ["required"] }));
    expect(res.status).toBe(expected.status);
    expect(await res.json()).toEqual(await expected.json());
    expect(res.headers.get("cache-control")).toBe(expected.headers.get("cache-control"));
  });

  it("an unknown error is a 500 'internal' envelope, logged with the request id", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = app();
    a.get("/api/v1/crash", () => {
      throw new Error("db exploded");
    });
    const res = await a.request("http://localhost/api/v1/crash", { headers: { "x-request-id": "rid-for-crash-1" } });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "internal" } });
    expect(err.mock.calls.some((c) => String(c[0]).includes("rid=rid-for-crash-1"))).toBe(true);
  });
});

describe("after scheduler", () => {
  it("runs the task without being awaited and reports a rejection instead of losing it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    registerAfterScheduler();
    let ran = false;
    runAfter(() => {
      ran = true;
    });
    runAfter(async () => {
      throw new Error("later failed");
    });
    expect(ran).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toBe(true);
    expect(err.mock.calls.some((c) => String(c[0]).includes("after() task failed"))).toBe(true);
  });
});
