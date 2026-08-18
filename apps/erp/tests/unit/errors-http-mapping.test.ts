import { describe, expect, it, vi, afterEach } from "vitest";
import { withErrors, toErrorResponse } from "@/lib/errors/http";
import {
  AppError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/lib/errors/classes";

// Complements m4-error-messages.test.ts (which owns the prod-vs-dev message
// hiding). This file pins the STATUS/CODE mapping: every AppError subclass and
// every Prisma error code withErrors translates. All ~390 handlers depend on
// this table — a route test asserting "404" is really asserting this mapping.

afterEach(() => vi.restoreAllMocks());

async function errBody(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

describe("toErrorResponse — AppError subclasses", () => {
  it.each([
    [new AuthError(), 401, "unauthenticated"],
    [new ForbiddenError(), 403, "forbidden"],
    [new NotFoundError(), 404, "not_found"],
    [new ConflictError(), 409, "conflict"],
    [new ValidationError(), 400, "validation_error"],
  ] as const)("%s → its own status/code", async (err, status, code) => {
    const res = toErrorResponse(err);
    expect(res.status).toBe(status);
    expect((await errBody(res)).code).toBe(code);
  });

  it("splits details into fields vs details on the wire", async () => {
    const err = new AppError(400, "validation_error", "bad", {
      fields: { email: ["invalid"] },
      hint: "check the address",
    });
    const res = toErrorResponse(err);
    const body = (await res.json()) as {
      error: { fields?: unknown; details?: unknown };
    };
    expect(body.error.fields).toEqual({ email: ["invalid"] });
    expect(body.error.details).toEqual({ hint: "check the address" });
  });
});

describe("toErrorResponse — Prisma error mapping", () => {
  it("P2025 (record not found) → 404", async () => {
    const res = toErrorResponse({ code: "P2025", message: "No record" });
    expect(res.status).toBe(404);
    expect((await errBody(res)).code).toBe("not_found");
  });

  it("P2002 (unique violation) → 409", async () => {
    const res = toErrorResponse({ code: "P2002", message: "Unique constraint" });
    expect(res.status).toBe(409);
    expect((await errBody(res)).code).toBe("conflict");
  });

  it("P2023 with a malformed id → 404 (caller input)", () => {
    const res = toErrorResponse({ code: "P2023", message: "Malformed ObjectID" });
    expect(res.status).toBe(404);
  });

  it("P2023 WITHOUT 'malformed' → 500 (server-side schema drift, must not hide)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorResponse({
      code: "P2023",
      message: "Could not decode enum value 'shell'",
    });
    expect(res.status).toBe(500);
  });

  it("invalid uuid input syntax → 404", () => {
    const res = toErrorResponse(
      new Error('invalid input syntax for type uuid: "abc"'),
    );
    expect(res.status).toBe(404);
  });
});

describe("withErrors wrapper", () => {
  it("returns the handler's response untouched on success", async () => {
    const handler = withErrors(async () => new Response(null, { status: 204 }) as never);
    const res = await handler(new Request("http://t.local"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(204);
  });

  it("converts a thrown AppError into the envelope", async () => {
    const handler = withErrors(async () => {
      throw new ForbiddenError("nope");
    });
    const res = await handler(new Request("http://t.local"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(403);
    expect((await errBody(res)).message).toBe("nope");
  });

  it("supplies a default ctx when Next passes none", async () => {
    const handler = withErrors(async (_req, ctx) => {
      const params = await ctx.params;
      expect(params).toEqual({});
      return new Response(null, { status: 200 }) as never;
    });
    // Next.js calls route handlers without ctx for non-dynamic routes.
    const res = await handler(
      new Request("http://t.local"),
      undefined as unknown as { params: Promise<Record<string, string>> },
    );
    expect(res.status).toBe(200);
  });
});
