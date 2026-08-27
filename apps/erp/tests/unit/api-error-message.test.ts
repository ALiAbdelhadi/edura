import { describe, it, expect, afterEach, vi } from "vitest";

const realFetch = globalThis.fetch;

function stubResponse(status: number, body: unknown, contentType = "application/json") {
  globalThis.fetch = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": contentType },
    }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function post(): Promise<Error> {
  const { api } = await import("@/lib/api/client");
  const client = api.extend({ prefix: "http://test.local/api/v1" });
  try {
    await client.post("centers/x/roster/teachers/invite", { json: { email: "a@b.com" } });
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected the request to reject");
}

describe("api client error surfacing", () => {
  it("lifts the envelope message onto the error for a 409", async () => {
    stubResponse(409, {
      error: {
        code: "conflict",
        message: "This teacher is already registered — send them a collaboration request instead",
      },
    });
    const err = await post();
    expect(err.message).toBe(
      "This teacher is already registered — send them a collaboration request instead",
    );
    expect(err.message).not.toMatch(/status code/i);
  });

  it("accepts a bare { message } body too", async () => {
    stubResponse(400, { message: "Email exists with a different role" });
    const err = await post();
    expect(err.message).toBe("Email exists with a different role");
  });

  it("keeps ky's default message when the body is not JSON", async () => {
    stubResponse(502, "<html>Bad Gateway</html>", "text/html");
    const err = await post();
    expect(err.message).toMatch(/502/);
  });

  it("keeps ky's default message when the envelope carries no message", async () => {
    stubResponse(409, { error: { code: "conflict" } });
    const err = await post();
    expect(err.message).toMatch(/409/);
  });
});
