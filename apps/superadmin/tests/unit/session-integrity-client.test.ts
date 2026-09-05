import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shared client only dispatches in a browser; give the node environment a
// window that can carry events so the dispatch path is exercised for real.
const events: { reason: string }[] = [];
const target = new EventTarget();

beforeEach(() => {
  events.length = 0;
  (globalThis as { window?: unknown }).window = Object.assign(target, {
    dispatchEvent: (ev: Event) => {
      events.push((ev as CustomEvent<{ reason: string }>).detail);
      return true;
    },
  });
});

const realFetch = globalThis.fetch;

function stubResponse(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

async function get(): Promise<unknown> {
  const { api } = await import("@/lib/api/client");
  const client = api.extend({ prefix: "http://test.local/api/v1" });
  try {
    await client.get("finance/payouts");
    return null;
  } catch (e) {
    return e;
  }
}

describe("shared api client session-integrity events (superadmin)", () => {
  it("dispatches session_expired on a plain 401", async () => {
    stubResponse(401, { error: { code: "unauthenticated", message: "no session" } });
    await get();
    expect(events).toEqual([{ reason: "session_expired" }]);
  });

  it("dispatches session_conflict when the envelope carries the code", async () => {
    stubResponse(401, { error: { code: "session_conflict", message: "ambiguous" } });
    await get();
    expect(events).toEqual([{ reason: "session_conflict" }]);
  });

  it("dispatches role_mismatch on 403 with the reason detail", async () => {
    stubResponse(403, {
      error: { code: "forbidden", message: "nope", details: { reason: "role_mismatch" } },
    });
    await get();
    expect(events).toEqual([{ reason: "role_mismatch" }]);
  });

  it("stays silent on an ordinary 403", async () => {
    stubResponse(403, { error: { code: "forbidden", message: "nope" } });
    await get();
    expect(events).toEqual([]);
  });

  it("stays silent on success", async () => {
    stubResponse(200, { data: [] });
    const err = await get();
    expect(err).toBeNull();
    expect(events).toEqual([]);
  });
});

describe("SessionIntegrityGuard.resolveIntegrityAction (superadmin)", () => {
  it("ends the session on session_conflict anywhere", async () => {
    const { resolveIntegrityAction } = await import(
      "@/components/providers/session-integrity-guard"
    );
    expect(resolveIntegrityAction({ reason: "session_conflict", onDashboard: false })).toBe(
      "end-session",
    );
    expect(resolveIntegrityAction({ reason: "session_conflict", onDashboard: true })).toBe(
      "end-session",
    );
  });

  it("ends the session on session_expired only inside the dashboard", async () => {
    const { resolveIntegrityAction } = await import(
      "@/components/providers/session-integrity-guard"
    );
    expect(resolveIntegrityAction({ reason: "session_expired", onDashboard: true })).toBe(
      "end-session",
    );
    expect(resolveIntegrityAction({ reason: "session_expired", onDashboard: false })).toBe(
      "ignore",
    );
  });

  it("ignores role_mismatch — the back office has no portals", async () => {
    const { resolveIntegrityAction } = await import(
      "@/components/providers/session-integrity-guard"
    );
    expect(resolveIntegrityAction({ reason: "role_mismatch", onDashboard: true })).toBe("ignore");
  });
});
