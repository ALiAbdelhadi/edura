import { describe, it, expect, afterEach, vi } from "vitest";

// The API answers a refusal with `{ error: { code, message } }`. ky's own
// HTTPError message is only "Request failed with status code 409: POST <url>",
// and the old client read `error.response.data` — an axios shape ky never
// produces — so the real reason ("this teacher is already registered") never
// reached the user. These assert the message survives the client boundary.

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

// The real exported client, with only its relative prefix made absolute so the
// request is resolvable under vitest's node environment. `extend` MERGES hooks,
// so the `beforeError` hook under test is the shipped one, not a copy.
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
    // ky's generic text must not be what the user sees.
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
