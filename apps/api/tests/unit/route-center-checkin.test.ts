import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@repo/server-core/erp-auth/session", () => ({
  requireSession: (...a: unknown[]) => requireSession(...(a as [])),
  getSessionUser: vi.fn(),
}));

const platformDb = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
  scopedDb: vi.fn(),
}));

const counterCheckin = vi.fn();
vi.mock("@repo/server-core/services/attendance/checkin", () => ({
  counterCheckin: (...a: unknown[]) => counterCheckin(...(a as [])),
}));

const { POST } = await import("../../src/routes/v1/center/checkin/route");
const { AuthError, BusinessRuleError } = await import("@repo/server-core/errors/classes");

const owner: SessionUser = {
  id: "owner-1",
  role: "center_admin",
  centerId: "c-1",
  locale: "ar",
};

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function hit(body: unknown) {
  return POST(
    new Request("http://t.local/api/v1/center/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

describe("POST /api/v1/center/checkin", () => {
  it("checks the student in for the chosen session (owner path)", async () => {
    requireSession.mockResolvedValue(owner);
    counterCheckin.mockResolvedValue({ status: "counter_checked_in" });
    const res = await hit({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    expect(res.status).toBe(200);
    expect(counterCheckin).toHaveBeenCalledWith(
      { studentId: STUDENT_ID, sessionId: SESSION_ID },
      expect.objectContaining({ role: "center_admin", centerId: "c-1" }),
    );
  });

  it("uncovered student → 402 needs_payment with the service's details", async () => {
    requireSession.mockResolvedValue(owner);
    counterCheckin.mockImplementation(async () => {
      throw new BusinessRuleError("Student has no coverage for this session", {
        code: "needs_payment",
        pricePerSession: 5000,
      });
    });
    const res = await hit({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    expect(res.status).toBe(402);
    const err = ((await res.json()) as {
      error: { code: string; details: { code: string; pricePerSession: number } };
    }).error;
    expect(err.code).toBe("needs_payment");
    expect(err.details.pricePerSession).toBe(5000);
  });

  it("anonymous → 401, the service is never reached", async () => {
    counterCheckin.mockClear();
    requireSession.mockImplementation(async () => {
      throw new AuthError();
    });
    const res = await hit({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    expect(res.status).toBe(401);
    expect(counterCheckin).not.toHaveBeenCalled();
  });

  it("a plain teacher → 403 (centerStaff wrapper, default-closed)", async () => {
    counterCheckin.mockClear();
    requireSession.mockResolvedValue({ id: "t-1", role: "teacher", locale: "ar" });
    const res = await hit({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    expect(res.status).toBe(403);
    expect(counterCheckin).not.toHaveBeenCalled();
  });

  it("400 on non-uuid ids — .strict() schema, service untouched", async () => {
    counterCheckin.mockClear();
    requireSession.mockResolvedValue(owner);
    const res = await hit({ studentId: "abc", sessionId: "def", extra: true });
    expect(res.status).toBe(400);
    expect(counterCheckin).not.toHaveBeenCalled();
  });
});
