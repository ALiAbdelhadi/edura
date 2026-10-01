import { afterEach, describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "@repo/server-core/errors/http";
import { AppError } from "@repo/server-core/errors/classes";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function body(res: Awaited<ReturnType<typeof toErrorResponse>>) {
  return (await res.json()) as { error: { code: string; message: string } };
}

const LEAKY =
  'null value in column "wallet_balance" of relation "center_wallets" ' +
  "violates not-null constraint at /app/node_modules/pg/lib/client.js:526";

describe("M4 — production hides internal details but still logs them", () => {
  it("prod: unhandled error → generic body, real error logged server-side", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const raw = new Error(LEAKY);
    const res = toErrorResponse(raw);
    const json = await body(res);

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("internal");
    expect(json.error.message).toBe("Internal error");
    expect(json.error.message).not.toContain("wallet_balance");
    expect(json.error.message).not.toContain("center_wallets");
    expect(json.error.message).not.toContain("node_modules");

    expect(errSpy).toHaveBeenCalledWith("[unhandled]", raw);
    expect(errSpy.mock.calls[0][1]).toBe(raw); // the actual Error object
  });
});

describe("M4 — development still surfaces the real message", () => {
  it("dev: unhandled error → real message in body, still logged", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = toErrorResponse(new Error(LEAKY));
    const json = await body(res);

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("internal");
    expect(json.error.message).toBe(LEAKY); // full detail for debuggability
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});

describe("M4 — known/safe errors are unaffected in production", () => {
  it("prod: AppError keeps its own (safe, author-chosen) message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = toErrorResponse(
      new AppError(403, "forbidden", "You do not have access to this center"),
    );
    const json = await body(res);

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("forbidden");
    expect(json.error.message).toBe("You do not have access to this center");
  });

  it("prod: Prisma-mapped error keeps its safe generic message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = toErrorResponse({ code: "P2025", message: "Record to update not found." });
    const json = await body(res);

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(json.error.message).toBe("Resource not found");
  });
});
