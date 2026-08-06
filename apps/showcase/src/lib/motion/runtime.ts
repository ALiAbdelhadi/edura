"use client";

import type { gsap } from "gsap";


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

export const EASE = {
  scrub: "none",
  play: "power2.out",
} as const;

export const DURATION = {
  fast: 0.3,
  base: 0.6,
  slow: 0.9,
} as const;
