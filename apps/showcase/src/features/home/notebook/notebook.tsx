"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMotion } from "@/lib/motion/motion-provider";
import { useScene } from "@/lib/motion/use-scene";
import type { NotebookProgress } from "./notebook-scene";
import type { Locale } from "@/lib/i18n";

/**
 * The signature hero, and the site's ONE spend of spectacle (D-044).
 *
 * WHO GETS THE 3D, AND WHO GETS A PICTURE OF IT
 * ----------------------------------------------------------------------------
 * three.js is ~150 KB gzipped before anything is drawn, and the scene runs a
 * render loop. Three groups are better served by a still:
 *
 *   • prefers-reduced-motion — a scroll-driven opening book is motion, however
 *     tasteful. Not negotiable.
 *   • narrow viewports — a phone pays the most for the download and the frame
 *     loop and sees the least of the geometry.
 *   • anything without WebGL — rather than a blank canvas.
 *
 * The poster is a render OF THIS SCENE at its best angle, not a drawing of
 * something similar, so the two groups see the same object.
 *
 * The import is dynamic with `ssr: false` for both reasons that matters: it
 * keeps three.js in its own lazy chunk out of every page's first load, and the
 * scene touches `window`/WebGL, which has no server equivalent.
 */
const NotebookScene = dynamic(() => import("./notebook-scene"), {
  ssr: false,
  loading: () => null,
});

/** Below this width the poster is used. Matches the design system's `sm`. */
const MIN_3D_WIDTH = 768;

/**
 * Probed once per page load and cached: a browser does not gain or lose WebGL
 * between renders, and creating a throwaway canvas on every snapshot read would
 * be a real cost for a value that cannot change.
 */
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

/**
 * Whether this visitor gets the live scene.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the answer is
 * derived from EXTERNAL state (a media query and a GPU capability), which is
 * exactly what this hook exists for. The effect version set state synchronously
 * inside the effect body, which React 19 flags as a cascading render — and it
 * was also a genuine double-render on every load.
 *
 * The server snapshot is `false`, so the markup React renders on the server is
 * the poster. That is the right default in both directions: it is what a
 * reduced-motion or no-WebGL visitor keeps, and it means nobody is ever served
 * a canvas element that then has to be torn down.
 */
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
  // A stable mutable box, created once. `useRef(x).current` read during render
  // is a ref access React 19 rejects outright; the state initializer gives the
  // same single identity without pretending the value is rendered state.
  const [progress] = useState<NotebookProgress>(() => ({ current: 0 }));
  const [active, setActive] = useState(false);
  const holderRef = useRef<HTMLDivElement | null>(null);

  // Scroll → progress. Written straight into the ref; no React state, so a
  // pinned scene does not re-render the tree sixty times a second.
  const sceneRef = useScene(
    ({ root, gsap, ScrollTrigger }) => {
      if (!canRender) return;
      // Created inside the scene's gsap.context(), so `ctx.revert()` on unmount
      // kills it — no explicit teardown, and no chance of one being forgotten.
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

  // Only render frames while the canvas is actually on screen.
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
              // The hero is the LCP element on this page for everyone who gets
              // the poster, so it is fetched eagerly and at high priority.
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
