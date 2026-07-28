// Proof for the shared bottom-navigation slot logic.
//
// It lives in `packages/ui` and the student, parent and staff portals all
// depend on it, so its invariants are asserted rather than eyeballed. The one
// that is easy to regress: the ACTIVE destination must always be reachable in
// one press, even when it would otherwise fall into the overflow.
import { describe, expect, it } from "vitest";
import { computeSlots } from "@repo/ui/components/bottom-nav";

type Item = { key: string };
const mk = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}` }));

/** slots ∪ overflow must be exactly `items` — nothing lost, nothing doubled. */
function expectPartition(items: Item[], slots: Item[], overflow: Item[]) {
  const keys = [...slots, ...overflow].map((i) => i.key);
  expect(new Set(keys).size).toBe(keys.length); // no duplicates
  expect(keys.sort()).toEqual(items.map((i) => i.key).sort()); // none lost
}

describe("computeSlots", () => {
  it("shows everything when it fits, with no 'more' slot consumed", () => {
    const items = mk(4);
    const { slots, overflow } = computeSlots(items, 5, "k0");
    expect(slots).toHaveLength(4);
    expect(overflow).toHaveLength(0);
    expectPartition(items, slots, overflow);
  });

  it("shows exactly maxVisible when the count matches", () => {
    const items = mk(5);
    const { slots, overflow } = computeSlots(items, 5);
    expect(slots).toHaveLength(5);
    expect(overflow).toHaveLength(0);
  });

  it("reserves one slot for 'more' as soon as it overflows", () => {
    const items = mk(6);
    const { slots, overflow } = computeSlots(items, 5, "k0");
    expect(slots.map((i) => i.key)).toEqual(["k0", "k1", "k2", "k3"]);
    expect(overflow.map((i) => i.key)).toEqual(["k4", "k5"]);
    expectPartition(items, slots, overflow);
  });

  it("promotes the active item when it would land in the overflow", () => {
    const items = mk(9); // the parent portal's real shape
    const { slots, overflow } = computeSlots(items, 5, "k7");
    expect(slots).toHaveLength(4);
    expect(slots.map((i) => i.key)).toContain("k7");
    // k3 was the last visible slot and is the one displaced.
    expect(slots.map((i) => i.key)).toEqual(["k0", "k1", "k2", "k7"]);
    expect(overflow.map((i) => i.key)).toContain("k3");
    expect(overflow.map((i) => i.key)).not.toContain("k7");
    expectPartition(items, slots, overflow);
  });

  it("keeps the active item reachable for EVERY destination", () => {
    const items = mk(9);
    for (const active of items.map((i) => i.key)) {
      const { slots, overflow } = computeSlots(items, 5, active);
      expect(
        slots.map((i) => i.key),
        `active=${active} must occupy a slot`,
      ).toContain(active);
      expect(slots.length).toBeLessThanOrEqual(5);
      expectPartition(items, slots, overflow);
    }
  });

  it("does not promote anything when activeKey is unknown or absent", () => {
    const items = mk(9);
    for (const active of [undefined, "nope"]) {
      const { slots, overflow } = computeSlots(items, 5, active);
      expect(slots.map((i) => i.key)).toEqual(["k0", "k1", "k2", "k3"]);
      expectPartition(items, slots, overflow);
    }
  });

  it("survives a maxVisible of 1 without dropping the active item", () => {
    const items = mk(4);
    const { slots, overflow } = computeSlots(items, 1, "k2");
    // Everything is overflow; there is no room to promote into.
    expect(slots).toHaveLength(0);
    expectPartition(items, slots, overflow);
  });
});
