"use client";

import type { SplitText as SplitTextType } from "gsap/SplitText";

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
    aria: "auto",
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
