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
  reduced: boolean;
  isRtl: boolean;
};

const MotionContext = createContext<MotionState>({ reduced: true, isRtl: true });

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

    Promise.all([loadMotion(), import("lenis")]).then(([m, { default: Lenis }]) => {
      if (cancelled) return;

      const lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        syncTouch: false,
      });

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

  return (
    <>
      <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
    </>
  )
}
