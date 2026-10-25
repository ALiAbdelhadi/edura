/*
 * The whole motion vocabulary of the site: things rise 12px into place, once.
 *   [data-rise]   — the hero, on page load, staggered in DOM order.
 *   [data-reveal] — a below-the-fold block, when it first enters the viewport.
 * Nothing idles, nothing is scrubbed by scroll, and reduced motion means none.
 */
export const RISE = {
  distance: 12,
  duration: 400,
  stagger: 60,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
} as const;

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function riseFrames(distance: number): Keyframe[] {
  return [
    { opacity: 0, translate: `0 ${distance}px` },
    { opacity: 1, translate: "0 0" },
  ];
}

// Plays the load-time rise on every [data-rise] element that has not risen yet.
// It runs twice: as an inline script right after <main> (so the first paint is
// already moving, never a visible-then-hidden flash) and from MotionRoot after a
// client-side navigation. It uses globals only so it survives toString(), and it
// marks elements with an expando, never an attribute, so hydration is untouched.
export function riseOnLoad(distance: number, duration: number, stagger: number, easing: string) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let order = 0;
  document.querySelectorAll("[data-rise]").forEach((el) => {
    const node = el as HTMLElement & { linktichRisen?: boolean };
    if (node.linktichRisen || typeof node.animate !== "function") return;
    node.linktichRisen = true;
    node.animate(
      [
        { opacity: 0, translate: "0 " + distance + "px" },
        { opacity: 1, translate: "0 0" },
      ],
      { duration, delay: order++ * stagger, easing, fill: "backwards" },
    );
  });
}

export const RISE_BOOTSTRAP = `(${riseOnLoad.toString()})(${RISE.distance},${RISE.duration},${RISE.stagger},${JSON.stringify(RISE.easing)})`;
