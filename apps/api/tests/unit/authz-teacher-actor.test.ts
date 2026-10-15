import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@repo/server-core/erp-auth/session", () => ({
  requireSession: (...args: unknown[]) => requireSession(...(args as [])),
}));

const platformDb = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
}));

const resolveActingTeacher = vi.fn();
vi.mock("@repo/server-core/authz/acting-teacher", () => ({
  resolveActingTeacher: (...args: unknown[]) => resolveActingTeacher(...(args as [])),
}));

const { requireTeacherActor, toActingUser } = await import("@repo/server-core/authz/teacher-actor");
const { ForbiddenError } = await import("@repo/server-core/errors/classes");

const teacher: SessionUser = { id: "t-1", role: "teacher", locale: "ar" };
const assistant: SessionUser = { id: "a-1", role: "assistant", locale: "en" };

beforeEach(() => {
  requireSession.mockReset();
  platformDb.mockReset();
  resolveActingTeacher.mockReset();
  platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      user: {
        findUnique: async () => ({ name: "Teacher One", email: "t@x.t", locale: "ar" }),
      },
    }),
  );
  resolveActingTeacher.mockResolvedValue("t-1");
});

describe("requireTeacherActor", () => {
  it("a teacher acts as themselves — no delegation fields", async () => {
    requireSession.mockResolvedValue(teacher);
    const actor = await requireTeacherActor();
    expect(actor).toMatchObject({
      acting: { id: "t-1", role: "teacher" },
      actorId: "t-1",
      onBehalfOf: null,
    });
    expect(resolveActingTeacher).not.toHaveBeenCalled();
  });

  it("an assistant acts AS their teacher, audited as themselves", async () => {
    requireSession.mockResolvedValue(assistant);
    const actor = await requireTeacherActor();
    expect(actor.acting).toMatchObject({ id: "t-1", role: "teacher" });
    expect(actor.actorId).toBe("a-1");
    expect(actor.onBehalfOf).toBe("t-1");
    expect(actor.caller).toBe(assistant);
    expect(actor.acting).toMatchObject({ name: "Teacher One", email: "t@x.t" });
  });

  it("the assistant path opens ONE platformDb transaction for both reads", async () => {
    requireSession.mockResolvedValue(assistant);
    const findUnique = vi.fn(async () => ({ name: "Teacher One", email: "t@x.t", locale: "ar" }));
    const tx = { user: { findUnique } };
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));
    await requireTeacherActor();
    expect(platformDb).toHaveBeenCalledTimes(1);
    expect(resolveActingTeacher).toHaveBeenCalledWith(tx, assistant);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.invocationCallOrder[0]).toBeGreaterThan(
      resolveActingTeacher.mock.invocationCallOrder[0]!,
    );
  });

  it("an unlinked assistant is refused before the teacher row is read", async () => {
    requireSession.mockResolvedValue(assistant);
    const findUnique = vi.fn();
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ user: { findUnique } }),
    );
    resolveActingTeacher.mockRejectedValue(new ForbiddenError());
    await expect(requireTeacherActor()).rejects.toBeInstanceOf(ForbiddenError);
    expect(platformDb).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("every other role is rejected default-closed", async () => {
    requireSession.mockResolvedValue({ id: "s-1", role: "student", locale: "ar" });
    await expect(requireTeacherActor()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("alsoRoles opt-in widens the door without touching delegation", async () => {
    const admin: SessionUser = {
      id: "c-1",
      role: "center_admin",
      centerId: "ctr",
      locale: "ar",
    };
    requireSession.mockResolvedValue(admin);
    const actor = await requireTeacherActor(["center_admin"]);
    expect(actor.acting).toBe(admin);
    expect(actor.onBehalfOf).toBeNull();
  });
});

describe("toActingUser", () => {
  it("non-assistants pass through unchanged (same reference)", async () => {
    await expect(toActingUser(teacher)).resolves.toBe(teacher);
  });

  it("an assistant is remapped to their teacher's id + role", async () => {
    const acting = await toActingUser(assistant);
    expect(acting).toMatchObject({ id: "t-1", role: "teacher", locale: "en" });
  });
});
