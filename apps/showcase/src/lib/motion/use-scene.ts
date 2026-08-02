"use client";

import { useEffect, useRef, type RefObject } from "react";
import { loadMotion, type MotionRuntime } from "./runtime";
import { useMotion } from "./motion-provider";

export type SceneContext = MotionRuntime & {
  /** Scope every selector through this. `q(".step")` never escapes the scene. */
  q: (selector: string) => Element[];
  /** The scene root element. */
  root: HTMLElement;
  isRtl: boolean;
};

/**
 * The one way a scene is built on this site.
 *
 * Four things it guarantees:
 *
 *  1. **Cleanup is total.** Everything created inside the callback is owned by
 *     a `gsap.context()` scoped to the root, so `ctx.revert()` on unmount kills
 *     the tweens, the ScrollTriggers, AND restores the inline styles GSAP
 *     wrote. A route change in the App Router unmounts without a page load, so
 *     a ScrollTrigger that outlives its element is a leak that keeps firing
 *     against a detached node.
 *
 *  2. **Reduced motion never builds a timeline at all.** Not "builds it with
 *     duration 0" — never runs, and never even downloads GSAP. The page's
 *     painted state is already the final state (see globals.css), so doing
 *     nothing is the correct result.
 *
 *  3. **GSAP is fetched lazily**, so it stays out of the first-load budget
 *     (see runtime.ts). The scene body receives the loaded runtime rather than
 *     importing it, which is also what stops a scene from reaching for an
 *     unregistered plugin.
 *
 *  4. **Direction is an input.** The callback receives `isRtl` and routes every
 *     horizontal value through `lib/motion/direction`. Rebuilds when direction
 *     changes, which happens on locale switch.
 */
export function useScene(
  build: (ctx: SceneContext) => void,
  deps: readonly unknown[] = [],
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const { reduced, isRtl } = useMotion();

  useEffect(() => {
    const root = ref.current;
    if (reduced || !root) return;

    let cancelled = false;
    let ctx: ReturnType<MotionRuntime["gsap"]["context"]> | null = null;
    let refresh: (() => void) | null = null;

    loadMotion().then((m) => {
      // The component can unmount while the chunk is in flight — on a slow
      // connection that window is seconds long, not milliseconds.
      if (cancelled || !ref.current) return;

      ctx = m.gsap.context((self) => {
        build({
          ...m,
          q: (selector: string) => (self.selector?.(selector) ?? []) as Element[],
          root,
          isRtl,
        });
      }, root);

      // Disarm the pre-paint hiding rule (see globals.css / motion-bootstrap).
      // Safe here because `fromTo`/`from` render their start values immediately
      // on creation, so every target this scene owns already carries an inline
      // opacity that outranks the CSS rule.
      document.documentElement.removeAttribute("data-reveal-armed");

      // A scene whose media (screenshots, video posters) loads after the first
      // layout will have measured the wrong height. One refresh after load is
      // cheaper and more reliable than per-image handlers.
      refresh = () => m.ScrollTrigger.refresh();
      window.addEventListener("load", refresh);
    });

    return () => {
      cancelled = true;
      if (refresh) window.removeEventListener("load", refresh);
      ctx?.revert();
    };
    // `build` is intentionally not a dependency: it is redefined on every
    // render, and depending on it would rebuild every scene on every render.
    // Pass anything the callback closes over via `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, isRtl, ...deps]);

  return ref;
}
