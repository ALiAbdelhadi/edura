"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMotion } from "@/lib/motion/motion-provider";
import { useScene } from "@/lib/motion/use-scene";
import type { NotebookProgress } from "./notebook-scene";
import type { Locale } from "@/lib/i18n";

const NotebookScene = dynamic(() => import("./notebook-scene"), {
  ssr: false,
  loading: () => null,
});

const MIN_3D_WIDTH = 768;

let webglSupport: boolean | null = null;
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function useCanRender3D(reduced: boolean): boolean {
  const subscribe = (onChange: () => void) => {
    const wide = window.matchMedia(`(min-width: ${MIN_3D_WIDTH}px)`);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  };

  const getSnapshot = () =>
    !reduced && window.matchMedia(`(min-width: ${MIN_3D_WIDTH}px)`).matches && hasWebGL();

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function Notebook({ locale }: { locale: Locale }) {
  const { reduced } = useMotion();
  const canRender = useCanRender3D(reduced);
  const [progress] = useState<NotebookProgress>(() => ({ current: 0 }));
  const [active, setActive] = useState(false);
  const holderRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useScene(
    ({ root, gsap, ScrollTrigger }) => {
      if (!canRender) return;
      ScrollTrigger.create({
        trigger: root,
        start: "top top",
        end: "+=220%",
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => {
          progress.current = self.progress;
        },
      });
      void gsap;
    },
    [canRender],
  );

  useEffect(() => {
    const el = holderRef.current;
    if (!el || !canRender) return;
    const io = new IntersectionObserver(([e]) => setActive(Boolean(e?.isIntersecting)), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [canRender]);

  const alt =
    locale === "ar"
      ? "دفتر ثلاثي الأبعاد بأقسام ملونة، قسم لكل دور."
      : "A 3D notebook with a coloured tab for each role.";

  return (
    <div ref={sceneRef} className="scene-pin relative">
      <div ref={holderRef} className="absolute inset-0">
        {canRender ? (
          <NotebookScene progress={progress} active={active} />
        ) : (
          <picture>
            <source srcSet="/hero/notebook.avif" type="image/avif" />
            <img
              src="/hero/notebook.webp"
              alt={alt}
              width={1200}
              height={900}
              loading="eager"
              fetchPriority="high"
              decoding="sync"
              className="mx-auto block h-full w-auto max-w-full object-contain"
            />
          </picture>
        )}
      </div>
    </div>
  );
}
