import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const tx = {
    parentStudentLink: { findMany: vi.fn() },
    user: { findMany: async () => [{ id: "admin-1" }] },
  };
  return {
    tx,
    platformDb: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    scopedDb: vi.fn(),
    appendMessage: vi.fn(),
    postGroupMessage: vi.fn(),
    fileReport: vi.fn(),
    bridgeMessage: vi.fn(),
    notify: vi.fn(async () => undefined),
    notifyAfterCommit: vi.fn(async () => undefined),
    deferred: [] as (() => unknown)[],
  };
});

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: h.scopedDb,
  platformDb: h.platformDb,
}));
vi.mock("@repo/server-core/services/notifications/notify", () => ({
  notify: h.notify,
  notifyAfterCommit: h.notifyAfterCommit,
}));
vi.mock("@repo/server-core/http/after", () => ({
  runAfter: (task: () => unknown) => h.deferred.push(task),
}));
vi.mock("@repo/server-core/services/messages/realtime-bridge", () => ({
  bridgeMessage: h.bridgeMessage,
  bridgeRead: vi.fn(),
}));
vi.mock("@repo/database/chat", async (orig) => ({
  ...(await orig<typeof import("@repo/database/chat")>()),
  appendMessage: h.appendMessage,
}));
vi.mock("@repo/database/chat-groups", () => ({
  postGroupMessage: h.postGroupMessage,
}));
vi.mock("@repo/database/chat-safety", () => ({ fileReport: h.fileReport }));

import { listOversightChildren } from "@repo/database/chat-oversight";
import { withParentFallbackMany } from "@repo/server-core/services/notifications/fanout";
import { fileReport, postToGroup, sendMessage } from "@repo/server-core/services/messages/messages";

afterEach(() => {
  vi.clearAllMocks();
  h.deferred.length = 0;
});

function oversightDb() {
  const calls: string[] = [];
  const track =
    <T,>(name: string, fn: (args: never) => T) =>
    (args: never) => {
      calls.push(name);
      return Promise.resolve(fn(args));
    };
  const db = {
    parentStudentLink: {
      findMany: track("links", () => [
        { studentId: "minor" },
        { studentId: "adult" },
        { studentId: "noprofile" },
      ]),
    },
    user: {
      findMany: track("users", (args: { where: { role?: unknown } }) =>
        args.where.role
          ? [{ id: "teacher" }, { id: "assistant" }]
          : [
              { id: "minor", name: "Minor" },
              { id: "adult", name: "Adult" },
              { id: "noprofile", name: "NoProfile" },
            ],
      ),
    },
    studentProfile: {
      findMany: track("profiles", () => [
        { userId: "minor", dateOfBirth: null, dateOfBirthVerifiedAt: null },
        {
          userId: "adult",
          dateOfBirth: new Date("1990-01-01T00:00:00Z"),
          dateOfBirthVerifiedAt: new Date("2020-01-01T00:00:00Z"),
        },
      ]),
      findFirst: track("profile-one", () => null),
    },
    conversation: {
      findMany: track("convs", () => [
        { userAId: "minor", userBId: "teacher" },
        { userAId: "assistant", userBId: "minor" },
        { userAId: "minor", userBId: "otherstudent" },
        { userAId: "noprofile", userBId: "teacher" },
      ]),
      count: track("conv-count", () => 0),
    },
  };
  return { db, calls };
}

describe("listOversightChildren (batched)", () => {
  it("same shape, DEFAULT-MINOR via the shared rule, fixed query count", async () => {
    const { db, calls } = oversightDb();
    const out = await listOversightChildren(db as never, "parent");
    expect(out).toEqual([
      { studentId: "minor", name: "Minor", isMinor: true, conversationCount: 2 },
      { studentId: "adult", name: "Adult", isMinor: false, conversationCount: 0 },
      { studentId: "noprofile", name: "NoProfile", isMinor: true, conversationCount: 1 },
    ]);
    expect(calls).toEqual(["links", "users", "profiles", "convs", "users"]);
  });
});

describe("withParentFallbackMany", () => {
  it("one IN query; parent when linked, the student otherwise, deduped", async () => {
    h.tx.parentStudentLink.findMany.mockResolvedValue([
      { studentId: "s1", parentId: "p1" },
      { studentId: "s1", parentId: "p9" },
      { studentId: "s2", parentId: "p1" },
    ]);
    const out = await withParentFallbackMany(["s1", "s2", "s3", "s3"]);
    expect(out).toEqual(["p1", "s3"]);
    expect(h.tx.parentStudentLink.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.parentStudentLink.findMany.mock.calls[0][0]).toMatchObject({
      where: { studentId: { in: ["s1", "s2", "s3"] }, status: "approved" },
    });
  });

  it("no students, no query", async () => {
    expect(await withParentFallbackMany([])).toEqual([]);
    expect(h.tx.parentStudentLink.findMany).not.toHaveBeenCalled();
  });
});

const user = { id: "u1", role: "teacher", name: "T" } as never;

describe("chat notifications leave the response path", () => {
  it("sendMessage returns before notify runs, then notifies post-commit", async () => {
    h.scopedDb.mockImplementation(async (_u: unknown, fn: (t: unknown) => unknown) => fn({}));
    h.appendMessage.mockResolvedValue({
      duplicate: false,
      recipientId: "r1",
      message: { id: "m1", conversationId: "c1", body: "hi" },
    });
    h.bridgeMessage.mockResolvedValue({ recipientOnline: false });

    const res = await sendMessage(user, { recipientId: "r1", body: "hi" });
    expect(res).toMatchObject({ id: "m1", duplicate: false });
    expect(h.notifyAfterCommit).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();

    expect(h.deferred).toHaveLength(1);
    await h.deferred[0]();
    expect(h.notifyAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ["r1"], type: "new_chat_message" }),
    );
  });

  it("sendMessage to an online recipient schedules nothing", async () => {
    h.scopedDb.mockImplementation(async (_u: unknown, fn: (t: unknown) => unknown) => fn({}));
    h.appendMessage.mockResolvedValue({
      duplicate: false,
      recipientId: "r1",
      message: { id: "m1", conversationId: "c1", body: "hi" },
    });
    h.bridgeMessage.mockResolvedValue({ recipientOnline: true });
    await sendMessage(user, { recipientId: "r1", body: "hi" });
    expect(h.deferred).toHaveLength(0);
  });

  it("postToGroup defers the group fan-out", async () => {
    h.scopedDb.mockImplementation(async (_u: unknown, fn: (t: unknown) => unknown) => fn({}));
    h.postGroupMessage.mockResolvedValue({
      duplicate: false,
      recipientIds: ["a", "b"],
      message: { id: "m2", body: "x" },
    });
    await postToGroup(user, "g1", { body: "x" });
    expect(h.notifyAfterCommit).not.toHaveBeenCalled();
    await h.deferred[0]();
    expect(h.notifyAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ["a", "b"], type: "chat_group_message" }),
    );
  });

  it("fileReport defers the admin lookup and notification", async () => {
    h.scopedDb.mockImplementation(async (_u: unknown, fn: (t: unknown) => unknown) => fn({}));
    h.fileReport.mockResolvedValue({ id: "rep1", category: "spam", involvesMinor: true });
    const rep = await fileReport(user, { category: "spam" as never });
    expect(rep).toMatchObject({ id: "rep1" });
    expect(h.notifyAfterCommit).not.toHaveBeenCalled();
    await h.deferred[0]();
    expect(h.notifyAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ["admin-1"], type: "chat_report_filed" }),
    );
  });
});

describe("listContacts shares repeated reach lookups within one call", () => {
  it("a parent's edges resolve teachers/centers of the children once each", async () => {
    const { listContacts } = await import("@repo/database/chat-scope");
    const calls: string[] = [];
    const db = new Proxy(
      {},
      {
        get: (_t, model: string) =>
          new Proxy(
            {},
            {
              get: (_m, op: string) => async () => {
                calls.push(`${model}.${op}`);
                if (model === "parentStudentLink") return [{ studentId: "kid" }];
                return [];
              },
            },
          ),
      },
    );
    await listContacts(db as never, { id: "p1", role: "parent" });
    expect(calls.filter((c) => c === "enrollment.findMany")).toHaveLength(2);
    expect(calls.filter((c) => c === "centerStudentRoster.findMany")).toHaveLength(1);
  });
});
