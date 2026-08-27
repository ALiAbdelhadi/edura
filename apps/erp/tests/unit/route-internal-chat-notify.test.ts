import { afterEach, describe, expect, it, vi } from "vitest";

const platformDb = vi.fn();
vi.mock("@/lib/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
}));

const notify = vi.fn(async () => undefined);
vi.mock("@/lib/services/notifications/notify", () => ({
  notify: (...a: unknown[]) => notify(...(a as [])),
}));

const { POST } = await import("@/app/api/v1/internal/chat-notify/route");

const VALID = {
  recipientId: "11111111-1111-4111-8111-111111111111",
  senderName: "أ. محمد",
  conversationId: "22222222-2222-4222-8222-222222222222",
  messageId: "33333333-3333-4333-8333-333333333333",
  body: "رسالة تجريبية",
};

function hit(body: unknown, secret?: string) {
  return POST(
    new Request("http://t.local/api/v1/internal/chat-notify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-internal-secret": secret } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  notify.mockClear();
});

describe("POST /api/v1/internal/chat-notify", () => {
  it("wrong secret → 403, nothing notified", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    const res = await hit(VALID, "wrong");
    expect(res.status).toBe(403);
    expect(notify).not.toHaveBeenCalled();
  });

  it("missing secret header → 403", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    const res = await hit(VALID);
    expect(res.status).toBe(403);
  });

  it("valid secret + existing message → notifies the recipient", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        conversationMessage: {
          findUnique: async () => ({ id: VALID.messageId, senderId: "sender-1" }),
        },
      }),
    );
    const res = await hit(VALID, "real-secret-value-123");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { notified: boolean } }).data.notified).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: [VALID.recipientId],
        type: "new_chat_message",
      }),
    );
  });

  it("message id that does not exist → notified:false, no fanout", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ conversationMessage: { findUnique: async () => null } }),
    );
    const res = await hit(VALID, "real-secret-value-123");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { notified: boolean } }).data.notified).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("400 on a malformed body (non-uuid ids)", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    const res = await hit({ ...VALID, messageId: "nope" }, "real-secret-value-123");
    expect(res.status).toBe(400);
  });
});
