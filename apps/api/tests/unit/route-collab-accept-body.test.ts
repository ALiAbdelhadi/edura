import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@repo/server-core/erp-auth/session", () => ({
  requireSession: (...a: unknown[]) => requireSession(...(a as [])),
  getSessionUser: vi.fn(),
}));
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: vi.fn(),
  scopedDb: vi.fn(),
}));

const acceptCollaborationRequest = vi.fn();
vi.mock("@repo/server-core/services/collaboration/collaboration", () => ({
  acceptCollaborationRequest: (...a: unknown[]) => acceptCollaborationRequest(...(a as [])),
}));
vi.mock("@repo/server-core/services/analytics/funnel", () => ({
  trackFirstTeacher: vi.fn(async () => undefined),
}));

const { POST } = await import("../../src/routes/v1/collaboration-requests/[id]/accept/route");

const owner: SessionUser = {
  id: "owner-1",
  role: "center_admin",
  centerId: "c-1",
  locale: "ar",
};
const ctx = { params: Promise.resolve({ id: "req-1" }) };

function hit(body?: string) {
  return POST(
    new Request("http://t.local/api/v1/collaboration-requests/req-1/accept", {
      method: "POST",
      ...(body !== undefined
        ? { headers: { "content-type": "application/json" }, body }
        : {}),
    }),
    ctx,
  );
}

describe("POST /api/v1/collaboration-requests/[id]/accept — body contract", () => {
  it("no body at all still accepts (tooling tolerance preserved)", async () => {
    requireSession.mockResolvedValue(owner);
    acceptCollaborationRequest.mockResolvedValue({ request: { centerId: "c-1" } });
    const res = await hit();
    expect(res.status).toBe(200);
    expect(acceptCollaborationRequest).toHaveBeenCalledWith(
      "req-1",
      expect.anything(),
      { pricingMethod: undefined },
    );
  });

  it("a valid pricingMethod is passed through to the service", async () => {
    requireSession.mockResolvedValue(owner);
    acceptCollaborationRequest.mockResolvedValue({ request: { centerId: "c-1" } });
    const res = await hit(JSON.stringify({ pricingMethod: "per_attending_student" }));
    expect(res.status).toBe(200);
    expect(acceptCollaborationRequest).toHaveBeenLastCalledWith(
      "req-1",
      expect.anything(),
      { pricingMethod: "per_attending_student" },
    );
  });

  it("malformed JSON → 400 (was silently swallowed to null and ACCEPTED)", async () => {
    requireSession.mockResolvedValue(owner);
    acceptCollaborationRequest.mockClear();
    const res = await hit("{");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      "Invalid JSON body",
    );
    expect(acceptCollaborationRequest).not.toHaveBeenCalled();
  });

  it("wrong-shape body → 400 validation_error (was a raw ZodError 500)", async () => {
    requireSession.mockResolvedValue(owner);
    acceptCollaborationRequest.mockClear();
    const res = await hit(JSON.stringify({ pricingMethod: "free_lunch" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "validation_error",
    );
    expect(acceptCollaborationRequest).not.toHaveBeenCalled();
  });
});
