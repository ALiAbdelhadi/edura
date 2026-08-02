"use client";

import type { SplitText as SplitTextType } from "gsap/SplitText";

/**
 * Arabic-safe SplitText (D-046).
 *
 * WHY CHAR-SPLITTING IS NOT AN OPTION
 * ----------------------------------------------------------------------------
 * SplitText's `chars` mode wraps every glyph in its own element. Arabic is a
 * CONNECTED script: a letter's shape depends on its neighbours (initial /
 * medial / final / isolated forms), and the shaping is resolved by the text
 * engine across a single text run. Split the run and every letter falls back to
 * its ISOLATED form — the joins disappear, ligatures such as لا decompose, and
 * the headline renders as a row of disconnected letterforms. It is not subtle
 * and it is not fixable with CSS.
 *
 * So `"chars"` is removed from the TYPE rather than discouraged in prose. A
 * caller cannot reach the broken state by accident — the same reasoning that
 * makes `<Num>` and `<ProseCount>` two components rather than one with a flag
 * (CONSTITUTION.md §6.3): a flag lets a caller reach an unsafe state, two
 * separate options cannot.
 *
 * Latin has no shaping to lose and could technically take a char split, but it
 * does not get one either: a per-character stagger is decoration, and D-044
 * does not buy decoration. Splitting the same way in both locales also means
 * the Arabic page is not quietly the degraded one.
 */
export type SplitGranularity = "words" | "lines";

export type SplitResult = {
  targets: Element[];
  revert: () => void;
};

export function splitHeadline(
  SplitText: typeof SplitTextType,
  element: Element,
  opts: { type?: SplitGranularity; mask?: boolean } = {},
): SplitResult {
  const type: SplitGranularity = opts.type ?? "words";

  const split = new SplitText(element, {
    type,
    // Keeps the original text available to assistive tech. SplitText restores
    // it on revert, but a crash between the two would otherwise leave the DOM
    // shredded for a screen reader.
    aria: "auto",
    // Masking clips each part so it can rise from behind an edge rather than
    // fading — the one headline reveal this site uses.
    mask: opts.mask ? type : undefined,
    wordsClass: "split-word",
    linesClass: "split-line",
  });

  const targets = (type === "lines" ? split.lines : split.words) as Element[];

  return {
    targets,
    revert: () => split.revert(),
  };
}
