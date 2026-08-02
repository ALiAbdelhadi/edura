"use client";

import type { gsap } from "gsap";
import { EASE, DURATION } from "./runtime";
import { logicalX, type LogicalDirection } from "./direction";

/**
 * `gsap` is imported UNALIASED because GSAP merges a namespace and a value
 * under that one name — `gsap.TweenTarget` is a type on the namespace while
 * `typeof gsap` is the value. Aliasing the import breaks the namespace half and
 * the types stop resolving.
 */
type Gsap = typeof gsap;

/**
 * The ONLY way a `[data-reveal]` element is animated in.
 *
 * WHY `gsap.from()` IS BANNED FOR THESE
 * ----------------------------------------------------------------------------
 * `from()` treats the element's CURRENT computed value as the animation's END
 * value. The pre-paint rule in globals.css sets `[data-reveal] { opacity: 0 }`,
 * so a `from({opacity: 0})` on one of these resolves to "animate 0 → 0" and the
 * element simply never appears. The failure is silent, identical in both
 * locales, and looks exactly like a missing ScrollTrigger — which makes it
 * expensive to diagnose from the symptom.
 *
 * `fromTo` with an explicit end value cannot be poisoned by the start state, so
 * the hiding rule and the animation stay independent. Every reveal goes here.
 *
 * `gsap` is a parameter rather than an import so this module carries no static
 * dependency on the lazy runtime chunk (see runtime.ts).
 */
export type RevealOptions = {
  /** Distance in px along the reading axis. Mirrors in RTL automatically. */
  x?: number;
  /** Which edge the element travels FROM. Defaults to the start edge. */
  from?: LogicalDirection;
  /** Distance in px along the block axis (never mirrors — RTL is horizontal). */
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
      // GSAP leaves `transform: translate(0px, 0px)` behind otherwise, which
      // creates a containing block and quietly breaks `position: fixed`
      // descendants and `position: sticky` inside revealed sections.
      clearProps: "transform",
    },
  };
}

/** Plays immediately — for above-the-fold content the reader is already on. */
export function reveal(
  g: Gsap,
  targets: gsap.TweenTarget,
  isRtl: boolean,
  opts: RevealOptions = {},
): gsap.core.Tween {
  const { fromVars, toVars } = vars(isRtl, opts);
  return g.fromTo(targets, fromVars, toVars);
}

/**
 * The same reveal, fired when the element scrolls into view.
 *
 * The ScrollTrigger is attached TO the tween rather than created separately to
 * `play()` a paused one. That is not stylistic: a separate trigger with an
 * `onEnter` callback only fires on an actual scroll EVENT, so an element whose
 * start position is already behind the viewport — a deep link, a restored
 * scroll position, a programmatic jump — never gets its callback and stays at
 * `opacity: 0` permanently. Attaching the animation lets ScrollTrigger evaluate
 * state on creation and on every refresh, so an already-passed trigger resolves
 * to "finished" rather than to "never started". This was a real blank section,
 * not a hypothetical.
 *
 * `once: true` because these are entrances, not scrubs — replaying a reveal
 * every time the reader scrolls back up is decoration, which D-044 forbids.
 */
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

/**
 * Releases a container that was hidden only so its CONTENTS could be prepared
 * without flashing — a headline being split, a diagram being measured. The
 * container itself is not animated; its children are.
 */
export function unhide(g: Gsap, targets: gsap.TweenTarget): void {
  g.set(targets, { opacity: 1 });
}
