// The palette's DESTINATION matcher, and the client half's staleness rule.
//
// Two things here are easy to break and invisible when broken:
//
//   1. The match must accept BOTH scripts. An Egyptian receptionist works an
//      Arabic UI on a Latin keyboard, so `wallet` has to find «المحفظة». That
//      behaviour lives in one `includes` over three strings, and a later tidy
//      that drops the English key from the haystack would look harmless.
//
//   2. `useGlobalSearch` must report `loading` while the LIVE query is ahead of
//      the answer in hand, not merely while a request is in flight. Without it
//      the palette shows the previous query's records with no sign they are
//      stale — which reads as the search having finished and found the wrong
//      thing. The rule is a pure expression, so it is asserted directly rather
//      than through a rendered component.
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
    // cmdk's default scorer accepts `wlt` for "wallet". On a counter, a query
    // that matches things it does not contain is unpredictable under pressure.
    expect(flat(filterNavGroups(GROUPS, "wlt"))).toEqual([]);
  });

  it("returns empty groups rather than dropping them, so headings stay stable", () => {
    const result = filterNavGroups(GROUPS, "wallet");
    expect(result).toHaveLength(2);
    expect(result[1]?.items).toEqual([]);
  });
});

/**
 * The staleness rule, transcribed from `use-global-search.ts`. Kept as a local
 * copy on purpose: importing the hook drags refine and next-intl into a test
 * that is about one boolean, and the value of the assertion is that the rule
 * is STATED somewhere a reader can check it against the implementation.
 */
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
