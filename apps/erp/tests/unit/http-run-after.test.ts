import { describe, expect, it, vi } from "vitest";
import { runAfter } from "@/lib/http/after";

// runAfter exists because next/server's after() THROWS outside a request
// scope — and the live-DB proof suites (c01-lesson-settlement) invoke route
// handlers directly, with no scope. This suite runs with no request scope
// either, so it exercises exactly that fallback: the task still runs, nothing
// throws, and a rejecting task is contained.

describe("runAfter (no request scope — the live-DB-suite condition)", () => {
  it("does not throw, and still runs the task", async () => {
    const task = vi.fn(async () => undefined);
    expect(() => runAfter(task)).not.toThrow();
    // The fallback schedules the task on a microtask; yield once.
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("contains a rejecting task instead of surfacing an unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const capture = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", capture);
    try {
      runAfter(async () => {
        throw new Error("task blew up");
      });
      // Let the microtask + rejection-handling settle.
      await new Promise((r) => setTimeout(r, 10));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", capture);
    }
  });
});
