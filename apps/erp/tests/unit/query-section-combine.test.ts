import { describe, expect, it } from "vitest";
import { combineQueries, type QueryLike } from "@repo/ui/components/query-section";

function q(over: Partial<QueryLike> & { refetch?: () => unknown }): QueryLike {
  return { isPending: false, isError: false, refetch: () => {}, ...over };
}

describe("combineQueries", () => {
  it("is pending while any member is pending", () => {
    const combined = combineQueries(q({}), q({ isPending: true }));
    expect(combined.isPending).toBe(true);
    expect(combined.isError).toBe(false);
  });

  it("surfaces the first failed member's error", () => {
    const err = new Error("boom");
    const combined = combineQueries(q({}), q({ isError: true, error: err }), q({ isError: true }));
    expect(combined.isError).toBe(true);
    expect(combined.error).toBe(err);
  });

  it("accepts isLoading as the pending flag", () => {
    const combined = combineQueries(q({ isLoading: true, isPending: undefined }));
    expect(combined.isPending).toBe(true);
  });

  it("refetches settled and failed members", () => {
    const calls: string[] = [];
    const combined = combineQueries(
      q({ refetch: () => calls.push("a") }),
      q({ isError: true, refetch: () => calls.push("b") }),
      q({ isPending: true, refetch: () => calls.push("c") }),
    );
    combined.refetch();
    expect(calls).toEqual(["a", "b"]);
  });
});
