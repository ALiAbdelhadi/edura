import { describe, expect, it } from "vitest";
import {
  filterNavGroups,
  type PaletteGroup,
} from "@repo/ui/components/nav-command-palette";

const item = (label: string, translated: string, href: string) => ({
  label,
  translated,
  href,
  icon: null,
});

const GROUPS: PaletteGroup[] = [
  {
    heading: "المال",
    items: [
      item("Wallet", "المحفظة", "/dashboard/teacher/wallet"),
      item("Fees", "الرسوم", "/dashboard/admin/fees"),
    ],
  },
  {
    heading: "الكاونتر",
    items: [item("Counter", "الكاونتر", "/dashboard/admin/counter")],
  },
];

const flat = (groups: PaletteGroup[]) =>
  groups.flatMap((g) => g.items.map((i) => i.label));

describe("filterNavGroups", () => {
  it("returns every group untouched for an empty query", () => {
    expect(filterNavGroups(GROUPS, "")).toBe(GROUPS);
    expect(flat(filterNavGroups(GROUPS, "   "))).toEqual([
      "Wallet",
      "Fees",
      "Counter",
    ]);
  });

  it("finds an Arabic label from its ENGLISH key — the Latin-keyboard path", () => {
    expect(flat(filterNavGroups(GROUPS, "wallet"))).toEqual(["Wallet"]);
    expect(flat(filterNavGroups(GROUPS, "WAL"))).toEqual(["Wallet"]);
  });

  it("finds a destination by its Arabic label too", () => {
    expect(flat(filterNavGroups(GROUPS, "الرسوم"))).toEqual(["Fees"]);
  });

  it("finds a destination by its href", () => {
    expect(flat(filterNavGroups(GROUPS, "admin/counter"))).toEqual(["Counter"]);
  });

  it("keeps the sidebar's grouping — it never flattens into one list", () => {
    const result = filterNavGroups(GROUPS, "a");
    expect(result).toHaveLength(GROUPS.length);
    expect(result.map((g) => g.heading)).toEqual(["المال", "الكاونتر"]);
  });

  it("is a SUBSTRING match, not a fuzzy one", () => {
    expect(flat(filterNavGroups(GROUPS, "wlt"))).toEqual([]);
  });

  it("returns empty groups rather than dropping them, so headings stay stable", () => {
    const result = filterNavGroups(GROUPS, "wallet");
    expect(result).toHaveLength(2);
    expect(result[1]?.items).toEqual([]);
  });
});

const isLoading = (live: string, debounced: string, settled: boolean) =>
  live.length >= 2 && (live !== debounced || !settled);

describe("global search staleness", () => {
  it("is loading while the debounce has not caught up with the input", () => {
    expect(isLoading("محم", "مح", true)).toBe(true);
  });

  it("is loading while the request for the settled query is still out", () => {
    expect(isLoading("محمد", "محمد", false)).toBe(true);
  });

  it("is not loading once the answer in hand answers the query in the box", () => {
    expect(isLoading("محمد", "محمد", true)).toBe(false);
  });

  it("is never loading below the minimum length — no request is made", () => {
    expect(isLoading("م", "", false)).toBe(false);
    expect(isLoading("", "", false)).toBe(false);
  });
});
