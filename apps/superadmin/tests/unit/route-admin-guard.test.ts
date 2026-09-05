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
}));

const { POST } = await import("@/app/api/v1/admin/accountants/route");
const { AuthError } = await import("@/lib/errors/classes");

const superAdmin: SessionUser = { id: "sa-1", role: "super_admin", locale: "ar" };
const accountant: SessionUser = { id: "acc-1", role: "accountant", locale: "ar" };

const VALID_BODY = {
  name: "محاسب جديد",
  email: "new-accountant@example.com",
  password: "Passw0rd!x",
};

function hit(body: unknown) {
  return POST(
    new Request("http://t.local/api/v1/admin/accountants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

describe("POST /api/v1/admin/accountants", () => {
  it("anonymous → 401 in the standard envelope", async () => {
    requireSession.mockImplementation(async () => {
      throw new AuthError();
    });
    const res = await hit(VALID_BODY);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "unauthenticated",
    );
  });

  it("accountant → 403 (admin surface is super_admin-only; no self-service hiring)", async () => {
    platformDb.mockClear();
    requireSession.mockResolvedValue(accountant);
    const res = await hit(VALID_BODY);
    expect(res.status).toBe(403);
    expect(platformDb).not.toHaveBeenCalled();
  });

  it("super_admin + invalid body → 400 before any DB write", async () => {
    platformDb.mockClear();
    requireSession.mockResolvedValue(superAdmin);
    const res = await hit({ ...VALID_BODY, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(platformDb).not.toHaveBeenCalled();
  });

  it("duplicate email/phone → 409 conflict", async () => {
    requireSession.mockResolvedValue(superAdmin);
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        user: {
          findFirst: async () => ({ id: "existing" }),
          create: async () => {
            throw new Error("must not be reached");
          },
        },
        auditLog: {
          create: async () => {
            throw new Error("must not be reached");
          },
        },
      }),
    );
    const res = await hit(VALID_BODY);
    expect(res.status).toBe(409);
  });

  it("creates the accountant — role is pinned server-side, never from the body", async () => {
    requireSession.mockResolvedValue(superAdmin);
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "u-new",
      name: data.name,
      email: data.email,
      role: data.role,
    }));
    const auditCreate = vi.fn(async () => ({ id: "a-1" }));
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        user: { findFirst: async () => null, create },
        auditLog: { create: auditCreate },
      }),
    );
    const res = await hit({ ...VALID_BODY, role: "super_admin" });
    expect([200, 201]).toContain(res.status);
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      (create.mock.calls[0][0] as { data: { role: string } }).data.role,
    ).toBe("accountant");

    // C-1: the audit row rides the SAME tx object the user row was created on —
    // creating a privileged back-office account can never commit unaudited.
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audited = (auditCreate.mock.calls[0] as unknown as [
      { data: { action: string; actorId: string; targetId: string } },
    ])[0].data;
    expect(audited.action).toBe("accountant.created");
    expect(audited.actorId).toBe(superAdmin.id);
    expect(audited.targetId).toBe("u-new");
  });
});
