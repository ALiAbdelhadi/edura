import { describe, expect, it } from "vitest";
import {
  fragmentVariants,
  literalFragment,
  literalFragments,
  matchesSearchQuery,
  narrowFragments,
  narrowQuery,
  normalizeIdentifier,
  normalizeSearchText,
  searchTerms,
} from "@repo/database/search-text";

describe("normalizeSearchText — the letter folds", () => {
  it.each([
    ["أحمد", "احمد", "hamza above alef — Shift on the standard layout"],
    ["إيهاب", "ايهاب", "hamza below alef"],
    ["آمال", "امال", "madda"],
    ["فاطمة", "فاطمه", "ta marbuta ↔ heh"],
    ["مصطفى", "مصطفي", "alef maqsura ↔ yeh"],
    ["مُحَمَّد", "محمد", "tashkeel, from a pasted document"],
    ["مـحـمـ__د".replace(/_/g, ""), "محمد", "tatweel"],
    ["رؤوف", "رووف", "hamza on waw"],
    ["هنـاء".replace("ـ", ""), "هنا", "bare hamza"],
    ["کریم", "كريم", "Persian kaf/yeh from a mis-set phone keyboard"],
  ])("«%s» and «%s» are the same word (%s)", (stored, typed) => {
    expect(normalizeSearchText(stored)).toBe(normalizeSearchText(typed));
    expect(matchesSearchQuery([stored], typed)).toBe(true);
  });

  it("folds Arabic-Indic and Eastern Arabic-Indic digits onto ASCII", () => {
    expect(normalizeSearchText("٠١١١١٣٦٧١٥٠")).toBe("01111367150");
    expect(normalizeSearchText("۰۱۲۳")).toBe("0123");
    expect(matchesSearchQuery(["01111367150"], "٠١١١١٣٦٧١٥٠")).toBe(true);
  });

  it("turns punctuation into a boundary, so a receipt reads both ways", () => {
    expect(searchTerms("RCP-NILE-2026-00004")).toEqual([
      "rcp",
      "nile",
      "2026",
      "00004",
    ]);
    expect(matchesSearchQuery(["RCP-NILE-2026-00004"], "nile 2026")).toBe(true);
  });
});

describe("matchesSearchTerms — how a name is actually typed", () => {
  it("is word-order independent: «حسن ملك» finds «ملك حسن»", () => {
    expect(matchesSearchQuery(["ملك حسن"], "حسن ملك")).toBe(true);
  });

  it("matches across the compound-name space: «عبدالرحمن» finds «عبد الرحمن»", () => {
    expect(matchesSearchQuery(["سلمى عبد الرحمن"], "عبدالرحمن")).toBe(true);
    expect(matchesSearchQuery(["محمد عبدالله"], "عبد الله")).toBe(true);
  });

  it("searches every field it is given, not just the name", () => {
    expect(matchesSearchQuery(["ملك حسن", "01111367150"], "0111136")).toBe(true);
  });

  it("ANDs its terms — a second word must NARROW the list", () => {
    expect(matchesSearchQuery(["محمد علي"], "محمد")).toBe(true);
    expect(matchesSearchQuery(["محمد"], "محمد علي")).toBe(false);
  });

  it("is not fuzzy — a wrong letter still fails", () => {
    expect(matchesSearchQuery(["محمد سيد"], "احمد")).toBe(false);
    expect(matchesSearchQuery(["Wallet"], "wlt")).toBe(false);
  });

  it("an empty query matches nothing rather than everything", () => {
    expect(matchesSearchQuery(["أي شيء"], "   ")).toBe(false);
  });
});

describe("literalFragment — the SQL pre-filter, and why it is safe", () => {
  it.each([
    ["احمد", "حمد"],
    ["فاطمه", "طم"],
    ["ندي", "ند"],
  ])("«%s» narrows to «%s» — the run nothing else folds onto", (term, frag) => {
    expect(literalFragment(term)).toBe(frag);
  });

  it("keeps ASCII letters and digits, which ILIKE and the data can compare", () => {
    expect(literalFragments("rcp nile 2026")).toEqual(["rcp", "nile", "2026"]);
  });

  it("sends a digit fragment in BOTH numeral systems", () => {
    expect(fragmentVariants("2026")).toEqual(["2026", "٢٠٢٦"]);
    expect(fragmentVariants("nile")).toEqual(["nile"]);
  });

  it("returns nothing rather than a one-character fragment", () => {
    expect(literalFragment("اي")).toBeNull();
    expect(literalFragments("اي")).toEqual([]);
  });

  it.each([
    ["أحمد علي", "احمد"],
    ["فاطمة الزهراء", "فاطمه"],
    ["ندى إيهاب", "ندي"],
    ["مصطفى كامل", "مصطفي"],
  ])("a fragment of «%s» survives in the RAW row «%s»", (raw, typed) => {
    expect(matchesSearchQuery([raw], typed)).toBe(true);
    for (const frag of literalFragments(typed)) {
      expect(
        fragmentVariants(frag).some((v) =>
          raw.toLowerCase().includes(v.toLowerCase()),
        ),
      ).toBe(true);
    }
  });
});

describe("normalizeIdentifier — a code read aloud and typed back", () => {
  it("drops separators and case, and folds the numerals", () => {
    expect(normalizeIdentifier("a1y00hdg")).toBe("A1Y00HDG");
    expect(normalizeIdentifier("A1Y-00 HDG")).toBe("A1Y00HDG");
    expect(normalizeIdentifier("rcp-nile-٢٠٢٦-00004")).toBe("RCPNILE202600004");
  });
});

describe("narrowQuery — the floor under the paginated lists", () => {
  const on = (needle: string) => [{ name: { contains: needle } }];

  it("is `narrowFragments` whenever the query CAN be narrowed", () => {
    expect(narrowQuery("احمد", on)).toEqual(
      narrowFragments(literalFragments("احمد"), on),
    );
  });

  it("ANDs one clause per term, so a second word narrows", () => {
    expect(narrowQuery("حسن ملك", on)).toHaveLength(2);
  });

  it("NEVER returns an empty AND — that would be 'no constraint'", () => {
    expect(narrowFragments(literalFragments("اي"), on)).toEqual([]);
    expect(narrowQuery("اي", on)).not.toEqual([]);
  });

  it("falls back to the RAW query, which is exactly the old behaviour", () => {
    expect(narrowQuery("اي", on)).toEqual([{ OR: on("اي") }]);
  });
});
