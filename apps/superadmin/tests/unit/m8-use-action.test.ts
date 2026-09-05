import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toasts: { kind: "success" | "error"; text: string }[] = [];

vi.mock("@repo/ui/components/sonner", () => ({
  toast: {
    success: (text: string) => toasts.push({ kind: "success", text }),
    error: (text: string) => toasts.push({ kind: "error", text }),
  },
}));

// The real client's prefix is "/api/v1", which has no origin to resolve
// against in node. Same ky, same localizing beforeError hook, absolute base.
vi.mock("@repo/client-core/api/client", async () => {
  const ky = (await import("ky")).default;
  const { localizeApiError } = await import("@repo/ui/lib/api-error");
  return {
    api: ky.create({
      prefix: "http://test.local/api/v1",
      retry: 0,
      hooks: {
        beforeError: [
          ({ error }: { error: unknown }) => localizeApiError(error) as never,
        ],
      },
    }),
  };
});

const realFetch = globalThis.fetch;
const calls: { url: string; method: string; body: string | null }[] = [];

function stub(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const req = input as Request;
    calls.push({
      url: req.url,
      method: req.method,
      body: init?.body ? String(init.body) : await req.clone().text() || null,
    });
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  toasts.length = 0;
  calls.length = 0;
  // `localizeApiError` reads the document language; node has none, so it
  // defaults to Arabic — which is the locale the operators actually use.
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

async function perform(
  options: Record<string, unknown>,
  input: Record<string, unknown> = {},
) {
  const { performAction } = await import("@repo/client-core/hooks/use-action");
  return performAction(options, input);
}

describe("M-8 performAction — the one write path", () => {
  it("posts the values and unwraps the { data } envelope", async () => {
    stub(200, { data: { id: "sub_1" } });
    const res = await perform(
      { url: "admin/subscriptions", successMsg: "تم" },
      { values: { plan: "monthly" } },
    );

    expect(res).toEqual({ ok: true, data: { id: "sub_1" } });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("http://test.local/api/v1/admin/subscriptions");
    expect(calls[0]?.body).toBe(JSON.stringify({ plan: "monthly" }));
  });

  it("M-1: a failure produces EXACTLY ONE toast", async () => {
    stub(422, { error: { code: "insufficient_funds", message: "Wallet too low" } });
    await perform({ url: "admin/refunds", successMsg: "تم" });

    expect(toasts.filter((t) => t.kind === "error")).toHaveLength(1);
    expect(toasts.filter((t) => t.kind === "success")).toHaveLength(0);
  });

  it("surfaces the server's own Arabic reason, not a generic bucket", async () => {
    stub(422, {
      error: {
        code: "duplicate_payment",
        message: "Payment already recorded",
        messageAr: "تم تسجيل هذه الدفعة من قبل",
      },
    });
    const res = await perform({ url: "admin/payments" });

    expect(res.ok).toBe(false);
    expect(toasts).toEqual([
      { kind: "error", text: "تم تسجيل هذه الدفعة من قبل" },
    ]);
  });

  it("falls back to the localized bucket when the server explains nothing", async () => {
    stub(500, { error: { code: "internal", message: "boom" } });
    await perform({ url: "admin/anything" });

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.text).toBe("حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.");
  });

  it("does not toast success, or run onSuccess, when the call failed", async () => {
    stub(403, { error: { code: "forbidden", message: "no" } });
    const onSuccess = vi.fn();
    await perform({ url: "admin/x", successMsg: "تم", onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(toasts.every((t) => t.kind === "error")).toBe(true);
  });

  it("runs onSuccess — the invalidation hook — before resolving", async () => {
    stub(200, { data: null });
    const order: string[] = [];
    await perform({
      url: "admin/x",
      onSuccess: async () => {
        await Promise.resolve();
        order.push("invalidated");
      },
    });
    order.push("resolved");

    expect(order).toEqual(["invalidated", "resolved"]);
  });

  it("honours per-call url, method and successMsg overrides", async () => {
    stub(200, { data: {} });
    await perform(
      { url: "admin/users", method: "post", successMsg: "generic" },
      { url: "admin/users/u1/sessions/s1", method: "delete", successMsg: "row" },
    );

    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("http://test.local/api/v1/admin/users/u1/sessions/s1");
    expect(toasts).toEqual([{ kind: "success", text: "row" }]);
  });

  it("appends a query string and drops null/undefined entries", async () => {
    stub(200, { data: {} });
    await perform(
      { url: "admin/export", method: "post" },
      { query: { format: "csv", from: undefined, to: null, page: 2 } },
    );

    expect(calls[0]?.url).toBe(
      "http://test.local/api/v1/admin/export?format=csv&page=2",
    );
  });

  it("treats an empty 204 body as success, not as a parse failure", async () => {
    stub(204, undefined);
    const res = await perform({ url: "admin/x", method: "delete" });

    expect(res.ok).toBe(true);
    expect(toasts.filter((t) => t.kind === "error")).toHaveLength(0);
  });

  it("rethrows when asked, so a ReasonDialog stays open on failure", async () => {
    stub(422, { error: { code: "validation_error", message: "bad" } });
    await expect(
      perform({ url: "admin/x", rethrow: true }, { values: {} }),
    ).rejects.toThrow();
    expect(toasts.filter((t) => t.kind === "error")).toHaveLength(1);
  });

  it("refuses a call with no url at all rather than hitting the app root", async () => {
    await expect(perform({}, {})).rejects.toThrow(/no url/);
  });
});

describe("M-1 the double toast cannot come back", () => {
  it("no screen mutates through Refine, so the provider toast has nothing to double", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry) && readFileSync(full, "utf8").includes("useCustomMutation")) {
          offenders.push(full);
        }
      }
    };
    walk(join(process.cwd(), "src"));

    // Refine's fallback errorNotification toasts every useCustomMutation
    // failure through the notification provider. As long as writes go through
    // `useAction` (or `api` directly), a screen's own catch cannot produce a
    // second toast for the same failure.
    expect(offenders).toEqual([]);
  });
});
