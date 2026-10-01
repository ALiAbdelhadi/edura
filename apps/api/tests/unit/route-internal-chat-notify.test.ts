import { afterEach, describe, expect, it, vi } from "vitest";

const platformDb = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
}));

const notify = vi.fn(async () => undefined);
vi.mock("@repo/server-core/services/notifications/notify", () => ({
  notify: (...a: unknown[]) => notify(...(a as [])),
}));

const { POST } = await import("../../src/routes/v1/internal/chat-notify/route");

const A = "11111111-1111-4111-8111-111111111111";
const B = "44444444-4444-4444-8444-444444444444";
const VALID = {
  conversationId: "22222222-2222-4222-8222-222222222222",
  messageId: "33333333-3333-4333-8333-333333333333",
  // RT-02: these used to be trusted from the body; they are now ignored and
  // derived from the message row, so a stale/hostile bridge cannot pick them.
  recipientId: "99999999-9999-4999-8999-999999999999",
  senderName: "hostile",
  body: "hostile body",
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

function dbWith(message: unknown, senderName = "أ. محمد") {
  platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      conversationMessage: { findUnique: async () => message },
      user: { findUnique: async () => ({ name: senderName }) },
    }),
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

  it("valid secret + existing message → notifies the OTHER participant with the stored body (RT-02)", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    dbWith({
      id: VALID.messageId,
      senderId: A,
      body: "رسالة تجريبية",
      conversation: { userAId: A, userBId: B },
    });
    const res = await hit(VALID, "real-secret-value-123");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { notified: boolean } }).data.notified).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: [B],
        type: "new_chat_message",
        title: "New message from أ. محمد",
        body: "رسالة تجريبية",
      }),
    );
    const arg = (notify.mock.calls[0] as unknown[])[0] as { recipients: string[]; body: string };
    expect(arg.recipients).not.toContain(VALID.recipientId);
    expect(arg.body).not.toBe(VALID.body);
  });

  it("message id that does not exist → notified:false, no fanout", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    dbWith(null);
    const res = await hit(VALID, "real-secret-value-123");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { notified: boolean } }).data.notified).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid message id", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "real-secret-value-123");
    const res = await hit({ ...VALID, messageId: "nope" }, "real-secret-value-123");
    expect(res.status).toBe(400);
  });
});
