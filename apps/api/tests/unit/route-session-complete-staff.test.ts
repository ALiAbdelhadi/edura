import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@repo/server-core/erp-auth/session", () => ({
  requireSession: (...a: unknown[]) => requireSession(...(a as [])),
  getSessionUser: vi.fn(),
}));

const platformDb = vi.fn();
const queryRaw = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown, opts?: unknown) => platformDb(cb, opts),
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...(a as [])) },
  scopedDb: vi.fn(),
}));

const completeSession = vi.fn();
vi.mock("@repo/server-core/services/finance/distribution", () => ({
  completeSession: (...a: unknown[]) => completeSession(...(a as [])),
}));

const { POST } = await import("../../src/routes/v1/sessions/[id]/complete/route");

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CENTER_ID = "33333333-3333-4333-8333-333333333333";

function hit() {
  return POST(
    new Request(`http://t.local/api/v1/sessions/${SESSION_ID}/complete`, { method: "POST" }),
    { params: Promise.resolve({ id: SESSION_ID }) },
  );
}

const staffUser: SessionUser = {
  id: "staff-1",
  role: "center_staff",
  locale: "ar",
} as SessionUser;

const teacherUser: SessionUser = {
  id: "teacher-1",
  role: "teacher",
  locale: "ar",
} as SessionUser;

function fakeTx(staffRole: string | null) {
  const auditCreate = vi.fn(async () => ({}));
  const tx = {
    user: { findUnique: async () => ({ status: "active" }) },
    auditLog: { create: auditCreate },
  };
  queryRaw.mockImplementation(async () => [
    { link: staffRole ? { centerId: CENTER_ID, role: staffRole } : null },
  ]);
  platformDb.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
  return { auditCreate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/sessions/[id]/complete — Phase 3 staff gate", () => {
  it("a receptionist completes the lesson and an on-behalf-of audit row is written", async () => {
    requireSession.mockResolvedValue(staffUser);
    const { auditCreate } = fakeTx("receptionist");
    completeSession.mockResolvedValue({
      session: { id: SESSION_ID },
      distribution: { distributed: true, presentCount: 3 },
    });

    const res = await hit();
    expect(res.status).toBe(200);
    expect(completeSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ role: "center_admin", centerId: CENTER_ID }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "session.completed",
          actorId: "staff-1",
          targetId: SESSION_ID,
          afterState: expect.objectContaining({
            staffRole: "receptionist",
            onBehalfOfCenter: CENTER_ID,
            distributed: true,
          }),
        }),
      }),
    );
  });

  it("a center_accountant is refused — staffAllow is receptionist + manager only", async () => {
    requireSession.mockResolvedValue(staffUser);
    fakeTx("center_accountant");
    const res = await hit();
    expect(res.status).toBe(403);
    expect(completeSession).not.toHaveBeenCalled();
  });

  it("a teacher's own completion is unchanged and writes NO staff audit", async () => {
    requireSession.mockResolvedValue(teacherUser);
    const { auditCreate } = fakeTx(null);
    completeSession.mockResolvedValue({
      session: { id: SESSION_ID },
      distribution: { distributed: true, presentCount: 1 },
    });
    const res = await hit();
    expect(res.status).toBe(200);
    expect(completeSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ id: "teacher-1", role: "teacher" }),
    );
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
