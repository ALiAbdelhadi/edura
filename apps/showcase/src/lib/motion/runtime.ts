"use client";

import type { gsap } from "gsap";

/**
 * GSAP + its plugins as a LAZY chunk, loaded once and shared.
 *
 * WHY THIS IS NOT A TOP-LEVEL IMPORT
 * ----------------------------------------------------------------------------
 * `MotionProvider` lives in the root layout, so anything it imports statically
 * lands in every page's first-load bundle. Importing gsap there put GSAP +
 * ScrollTrigger + SplitText + DrawSVG + Flip — ~61 KB gzipped — on the critical
 * path of every route, including ones with no animation at all. Measured
 * first-load was 208 KB against a 200 KB budget with nothing on the page but a
 * hero.
 *
 * Deferring it costs nothing real: no scene can run before hydration anyway,
 * and the pre-paint hiding rule (globals.css) plus its failsafe already cover
 * the window before the runtime arrives.
 *
 * The promise is cached at module scope, so N scenes on a page trigger ONE
 * network fetch and one `registerPlugin` call — which also preserves the
 * "register exactly once" guarantee the eager version had.
 */
export type MotionRuntime = {
  gsap: typeof gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
  SplitText: typeof import("gsap/SplitText").SplitText;
  DrawSVGPlugin: typeof import("gsap/DrawSVGPlugin").DrawSVGPlugin;
  Flip: typeof import("gsap/Flip").Flip;
};

let pending: Promise<MotionRuntime> | null = null;

export function loadMotion(): Promise<MotionRuntime> {
  pending ??= (async () => {
    // MorphSVG is deliberately absent — no approved scene morphs a path, and an
    // unused plugin is pure weight on a site gated by a byte budget.
    const [core, st, split, draw, flip] = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
      import("gsap/SplitText"),
      import("gsap/DrawSVGPlugin"),
      import("gsap/Flip"),
    ]);

    const { gsap } = core;
    gsap.registerPlugin(st.ScrollTrigger, split.SplitText, draw.DrawSVGPlugin, flip.Flip);

    return {
      gsap,
      ScrollTrigger: st.ScrollTrigger,
      SplitText: split.SplitText,
      DrawSVGPlugin: draw.DrawSVGPlugin,
      Flip: flip.Flip,
    };
  })();

  return pending;
}

/** The site's whole easing vocabulary. Two entries, on purpose (D-045). */
export const EASE = {
  /** Anything the user's scroll is driving. Linear, because the scrub IS the ease. */
  scrub: "none",
  /** Anything that plays once on its own. */
  play: "power2.out",
} as const;

export const DURATION = {
  fast: 0.3,
  base: 0.6,
  slow: 0.9,
} as const;
