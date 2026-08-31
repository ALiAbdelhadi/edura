import { describe, it, expect, afterEach, vi } from "vitest";
import { apiErrorMessage } from "@repo/ui/lib/api-error";

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

type LocalizedError = Error & {
  apiErrorCode?: string;
  serverMessage?: string;
  statusCode?: number;
};

async function post(): Promise<LocalizedError> {
  const { api } = await import("@/lib/api/client");
  const client = api.extend({ prefix: "http://test.local/api/v1" });
  try {
    await client.post("centers/x/roster/teachers/invite", { json: { email: "a@b.com" } });
  } catch (e) {
    return e as LocalizedError;
  }
  throw new Error("expected the request to reject");
}

describe("api client error surfacing", () => {
  it("localizes a 409 conflict and keeps the envelope text on serverMessage", async () => {
    stubResponse(409, {
      error: {
        code: "conflict",
        message: "This teacher is already registered — send them a collaboration request instead",
      },
    });
    const err = await post();
    expect(err.apiErrorCode).toBe("conflict");
    expect(err.message).toBe(apiErrorMessage("conflict", "ar"));
    expect(err.serverMessage).toBe(
      "This teacher is already registered — send them a collaboration request instead",
    );
    expect(err.message).not.toMatch(/status code/i);
  });

  it("keeps unmapped 4xx business messages verbatim", async () => {
    stubResponse(400, {
      error: { code: "needs_payment", message: "Student has no coverage for this session" },
    });
    const err = await post();
    expect(err.apiErrorCode).toBe("business");
    expect(err.message).toBe("Student has no coverage for this session");
  });

  it("localizes a non-JSON 5xx instead of leaking ky's status text", async () => {
    stubResponse(502, "<html>Bad Gateway</html>", "text/html");
    const err = await post();
    expect(err.apiErrorCode).toBe("server");
    expect(err.message).toBe(apiErrorMessage("server", "ar"));
    expect(err.message).not.toMatch(/502|status code/i);
  });

  it("localizes when the envelope carries no message", async () => {
    stubResponse(409, { error: { code: "conflict" } });
    const err = await post();
    expect(err.apiErrorCode).toBe("conflict");
    expect(err.message).toBe(apiErrorMessage("conflict", "ar"));
    expect(err.message).not.toMatch(/409/);
  });
});
