"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadMotion } from "./runtime";

type MotionState = {
  /** True when the user asked the OS for reduced motion. */
  reduced: boolean;
  /** True when the document direction is right-to-left. */
  isRtl: boolean;
};

const MotionContext = createContext<MotionState>({ reduced: true, isRtl: true });

/**
 * `reduced` starts TRUE and the provider relaxes it after reading the media
 * query. Defaulting the other way would play one frame of motion at a user who
 * asked for none, which is exactly the population that notices.
 */
export function useMotion(): MotionState {
  return useContext(MotionContext);
}

export function MotionProvider({
  isRtl,
  children,
}: {
  isRtl: boolean;
  children: ReactNode;
}) {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      // Mirrored onto the document so CSS and any non-React code read the same
      // switch, and so a Playwright pass can assert it without evaluating JS.
      // The pre-paint bootstrap already set this; here it only tracks changes.
      document.documentElement.dataset.motion = mq.matches ? "reduced" : "full";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    // Lenis and GSAP travel in the same lazy chunk — smooth scroll is only
    // meaningful alongside the scroll-driven scenes, so there is no case where
    // one is wanted without the other.
    Promise.all([loadMotion(), import("lenis")]).then(([m, { default: Lenis }]) => {
      if (cancelled) return;

      // D-047: Lenis rather than ScrollSmoother — no transform wrapper, so
      // `position: sticky` keeps working for the sticky sub-nav and the pins.
      const lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        // Touch devices already have native momentum; smoothing it again fights
        // the platform and makes the pins feel laggy.
        syncTouch: false,
      });

      // Drive Lenis from GSAP's ticker instead of its own rAF, so there is ONE
      // frame loop on the page. Two loops means ScrollTrigger can read a scroll
      // position Lenis has not committed yet, which shows up as pinned scenes
      // jittering by a frame.
      const raf = (time: number) => lenis.raf(time * 1000);
      m.gsap.ticker.add(raf);
      m.gsap.ticker.lagSmoothing(0);
      lenis.on("scroll", m.ScrollTrigger.update);

      teardown = () => {
        m.gsap.ticker.remove(raf);
        m.gsap.ticker.lagSmoothing(500, 33);
        lenis.destroy();
      };
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [reduced]);

  const value = useMemo(() => ({ reduced, isRtl }), [reduced, isRtl]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
