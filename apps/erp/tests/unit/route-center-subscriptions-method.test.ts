import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@/lib/auth/session", () => ({
  requireSession: (...a: unknown[]) => requireSession(...(a as [])),
  getSessionUser: vi.fn(),
}));

const platformDb = vi.fn();
vi.mock("@/lib/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
  scopedDb: vi.fn(),
}));

const createWalkInSubscription = vi.fn();
vi.mock("@/lib/services/subscriptions/subscriptions", () => ({
  createWalkInSubscription: (...a: unknown[]) => createWalkInSubscription(...(a as [])),
}));

const { POST } = await import("@/app/api/v1/center/subscriptions/route");

const owner: SessionUser = {
  id: "owner-1",
  role: "center_admin",
  centerId: "c-1",
  locale: "ar",
};

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function hit(body: unknown) {
  return POST(
    new Request("http://t.local/api/v1/center/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

const base = {
  studentId: STUDENT_ID,
  courseId: COURSE_ID,
  plan: "per_session",
  sessionId: SESSION_ID,
};

describe("POST /api/v1/center/subscriptions — payment methods (Phase 1)", () => {
  it.each(["cash", "instapay", "pos_card", "mobile_wallet"] as const)(
    "accepts %s and hands it to the service verbatim",
    async (method) => {
      requireSession.mockResolvedValue(owner);
      createWalkInSubscription.mockResolvedValue({ id: "sub-1" });
      const res = await hit({ ...base, paymentMethod: method });
      expect(res.status).toBe(201);
      expect(createWalkInSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: method }),
        expect.objectContaining({ role: "center_admin" }),
      );
    },
  );

  it("absent method reaches the service ABSENT — the cash default lives there, nowhere else", async () => {
    requireSession.mockResolvedValue(owner);
    createWalkInSubscription.mockClear();
    createWalkInSubscription.mockResolvedValue({ id: "sub-1" });
    const res = await hit(base);
    expect(res.status).toBe(201);
    const input = createWalkInSubscription.mock.calls[0][0] as Record<string, unknown>;
    expect("paymentMethod" in input && input.paymentMethod !== undefined).toBe(false);
  });

  it.each(["bank_transfer", "online_paymob", "wallet", "unknown", "CASH"])(
    "rejects %s with 400 — never a silent fallback to cash",
    async (method) => {
      requireSession.mockResolvedValue(owner);
      createWalkInSubscription.mockClear();
      const res = await hit({ ...base, paymentMethod: method });
      expect(res.status).toBe(400);
      expect(createWalkInSubscription).not.toHaveBeenCalled();
    },
  );
});
