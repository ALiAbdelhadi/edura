"use client";

import type { gsap } from "gsap";
import { logicalX, type LogicalDirection } from "./direction";
import { DURATION, EASE } from "./runtime";

type Gsap = typeof gsap;

export type RevealOptions = {
  x?: number;
  from?: LogicalDirection;
  y?: number;
  duration?: number;
  stagger?: number;
  delay?: number;
};

function vars(isRtl: boolean, o: RevealOptions) {
  return {
    fromVars: {
      opacity: 0,
      x: o.x ? logicalX(o.x, o.from ?? "start", isRtl) : 0,
      y: o.y ?? 0,
    },
    toVars: {
      opacity: 1,
      x: 0,
      y: 0,
      duration: o.duration ?? DURATION.base,
      stagger: o.stagger ?? 0,
      delay: o.delay ?? 0,
      ease: EASE.play,
      clearProps: "transform",
    },
  };
}

export function reveal(
  g: Gsap,
  targets: gsap.TweenTarget,
  isRtl: boolean,
  opts: RevealOptions = {},
): gsap.core.Tween {
  const { fromVars, toVars } = vars(isRtl, opts);
  return g.fromTo(targets, fromVars, toVars);
}

export function revealOnScroll(
  g: Gsap,
  targets: gsap.TweenTarget,
  isRtl: boolean,
  opts: RevealOptions & { trigger?: Element; start?: string } = {},
): gsap.core.Tween {
  const { trigger, start = "top 85%", ...rest } = opts;
  const { fromVars, toVars } = vars(isRtl, rest);
  return g.fromTo(targets, fromVars, {
    ...toVars,
    scrollTrigger: {
      trigger: trigger ?? (Array.isArray(targets) ? targets[0] : (targets as Element)),
      start,
      once: true,
    },
  });
}

export function unhide(g: Gsap, targets: gsap.TweenTarget): void {
  g.set(targets, { opacity: 1 });
}
