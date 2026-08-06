"use client";

import { useEffect, useRef, type RefObject } from "react";
import { loadMotion, type MotionRuntime } from "./runtime";
import { useMotion } from "./motion-provider";

export type SceneContext = MotionRuntime & {
  q: (selector: string) => Element[];
  root: HTMLElement;
  isRtl: boolean;
};

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
      if (cancelled || !ref.current) return;

      ctx = m.gsap.context((self) => {
        build({
          ...m,
          q: (selector: string) => (self.selector?.(selector) ?? []) as Element[],
          root,
          isRtl,
        });
      }, root);

      document.documentElement.removeAttribute("data-reveal-armed");

      refresh = () => m.ScrollTrigger.refresh();
      window.addEventListener("load", refresh);
    });

    return () => {
      cancelled = true;
      if (refresh) window.removeEventListener("load", refresh);
      ctx?.revert();
    };

  }, [reduced, isRtl, ...deps]);

  return ref;
}
