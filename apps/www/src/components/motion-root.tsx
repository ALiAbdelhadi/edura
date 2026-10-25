"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

import { REDUCED_MOTION, RISE, riseFrames, riseOnLoad } from "@/lib/motion";

// Elements that have already revealed stay revealed across client navigations.
const revealed = new WeakSet<Element>();

// The page is complete without JS: nothing is hidden in CSS. [data-rise] is
// played by the inline bootstrap on first load (see page-frame) and here after a
// client-side navigation; [data-reveal] is pre-set only when it starts below the
// fold, and rises once when it enters the viewport.
export function MotionRoot() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    riseOnLoad(RISE.distance, RISE.duration, RISE.stagger, RISE.easing);
  }, [pathname]);

  useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION).matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    const pending = new Set<HTMLElement>();
    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (revealed.has(el) || typeof el.animate !== "function") continue;
      if (el.getBoundingClientRect().top <= window.innerHeight) {
        revealed.add(el);
        continue;
      }
      el.style.opacity = "0";
      pending.add(el);
    }
    if (!pending.size) return;

    const show = (el: HTMLElement) => {
      el.style.removeProperty("opacity");
      pending.delete(el);
      revealed.add(el);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          observer.unobserve(el);
          show(el);
          el.animate(riseFrames(RISE.distance), {
            duration: RISE.duration,
            delay: order++ * RISE.stagger,
            easing: RISE.easing,
            fill: "backwards",
          });
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of pending) observer.observe(el);

    // A hidden tab never intersects; settle everything so nothing stays blank.
    const settle = () => {
      if (!document.hidden) return;
      observer.disconnect();
      for (const el of [...pending]) show(el);
    };
    document.addEventListener("visibilitychange", settle);

    return () => {
      document.removeEventListener("visibilitychange", settle);
      observer.disconnect();
      for (const el of pending) el.style.removeProperty("opacity");
      pending.clear();
    };
  }, [pathname]);

  return null;
}
