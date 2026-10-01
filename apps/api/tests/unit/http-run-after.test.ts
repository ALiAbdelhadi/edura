import { describe, expect, it, vi } from "vitest";
import { runAfter } from "@repo/server-core/http/after";

describe("runAfter (no request scope — the live-DB-suite condition)", () => {
  it("does not throw, and still runs the task", async () => {
    const task = vi.fn(async () => undefined);
    expect(() => runAfter(task)).not.toThrow();
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
      await new Promise((r) => setTimeout(r, 10));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", capture);
    }
  });
});
