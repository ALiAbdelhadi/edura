"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BOOK,
  PAGE_COUNT,
  ROLE_TABS,
  disposeTree,
  easeInOut,
  pageFlipProgress,
  tokenColor,
} from "./notebook-model";

/**
 * The 3D notebook.
 *
 * Loaded ONLY through `notebook.tsx`'s dynamic import, so three.js never enters
 * any other page's bundle — `/owners` and the rest ship no 3D at all.
 *
 * SCROLL DRIVES THIS THROUGH A REF, NOT REACT STATE
 * ----------------------------------------------------------------------------
 * A scroll-linked `useState` would re-render the React tree on every frame of a
 * pinned scene. The progress value is written into a ref by the parent and read
 * inside `useFrame`, so the React tree renders once and the 60fps work stays on
 * the GPU where it belongs.
 */

export type NotebookProgress = { current: number };

function Cover({
  progress,
  side,
}: {
  progress: NotebookProgress;
  side: "front" | "back";
}) {
  const ref = useRef<THREE.Group>(null);
  const color = useMemo(() => tokenColor("--indigo", "#1a2f73"), []);

  useFrame(() => {
    if (!ref.current || side === "back") return;
    // The cover opens across the first 35% of the scroll, then holds.
    const t = easeInOut(THREE.MathUtils.clamp(progress.current / 0.35, 0, 1));
    ref.current.rotation.y = -t * Math.PI * 0.82;
  });

  // Z-ORDER, front to back: front cover, page block, back cover. The first
  // pass put the block at `blockDepth/2` and the front cover at
  // `coverThickness` — so the paper stack sat IN FRONT of its own cover and the
  // closed book rendered as a grey card with an indigo edge.
  const z =
    side === "front"
      ? BOOK.blockDepth + BOOK.coverThickness / 2
      : -BOOK.coverThickness / 2;

  return (
    <group ref={ref} position={[BOOK.spineX, 0, 0]}>
      <mesh position={[BOOK.width / 2, 0, z]} castShadow receiveShadow>
        <boxGeometry args={[BOOK.width, BOOK.height, BOOK.coverThickness]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
      </mesh>
    </group>
  );
}

function Pages({ progress }: { progress: NotebookProgress }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const paper = useMemo(() => tokenColor("--sheet", "#ffffff"), []);

  useFrame(() => {
    for (let i = 0; i < PAGE_COUNT; i++) {
      const group = refs.current[i];
      if (!group) continue;
      // Pages begin flipping once the cover is open.
      const t = THREE.MathUtils.clamp((progress.current - 0.3) / 0.55, 0, 1);
      const p = easeInOut(pageFlipProgress(i, PAGE_COUNT, t));
      group.rotation.y = -p * Math.PI * 0.8;
    }
  });

  return (
    <>
      {Array.from({ length: PAGE_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[BOOK.spineX, 0, i * BOOK.pageThickness + 0.004]}
        >
          <mesh position={[BOOK.width / 2 - 0.04, 0, 0]}>
            <boxGeometry
              args={[BOOK.width - 0.08, BOOK.height - 0.08, BOOK.pageThickness]}
            />
            <meshStandardMaterial color={paper} roughness={0.95} metalness={0} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * One tab per role, protruding from the fore edge.
 *
 * They do NOT mirror in RTL. A notebook's tabs are a physical feature of the
 * object, and CONSTITUTION.md §6.4's rule is that an icon depicting an OBJECT
 * does not flip — the same reason the seal's rotation stays put.
 */
function Tabs() {
  // Per-tab fallbacks, so a token that fails to parse still lands on the right
  // hue rather than on one shared stand-in that would make two roles identical.
  const FALLBACKS: Record<string, string> = {
    "--indigo-soft": "#eaecf6",
    "--teal": "#0a7a6f",
    "--amber": "#a35a06",
    "--red": "#a81d1d",
    "--ink-2": "#5b6273",
  };
  const colors = useMemo(
    () => ROLE_TABS.map((tab) => tokenColor(tab.token, FALLBACKS[tab.token] ?? "#5b6273")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const spacing = (BOOK.height - 0.6) / ROLE_TABS.length;

  return (
    <>
      {ROLE_TABS.map((tab, i) => (
        <mesh
          key={tab.key}
          position={[
            BOOK.spineX + BOOK.width + 0.06,
            BOOK.height / 2 - 0.4 - i * spacing,
            BOOK.blockDepth / 2,
          ]}
        >
          <boxGeometry args={[0.22, spacing * 0.62, 0.05]} />
          <meshStandardMaterial color={colors[i]!} roughness={0.8} metalness={0} />
        </mesh>
      ))}
    </>
  );
}

/**
 * The solid block of paper between the covers.
 *
 * The individual page meshes are thin planes that flip; this is what the reader
 * actually SEES at the fore edge, and it is the difference between an object
 * made of paper and an indigo slab.
 */
function PageBlock() {
  const paper = useMemo(() => tokenColor("--paper", "#f7f6f2"), []);
  return (
    <mesh position={[BOOK.spineX + BOOK.width / 2 - 0.03, 0, BOOK.blockDepth / 2]}>
      <boxGeometry args={[BOOK.width - 0.06, BOOK.height - 0.06, BOOK.blockDepth]} />
      <meshStandardMaterial color={paper} roughness={1} metalness={0} />
    </mesh>
  );
}

function Rig({ progress }: { progress: NotebookProgress }) {
  const { camera } = useThree();

  const target = useRef(new THREE.Vector3()).current;

  useFrame(() => {
    const t = progress.current;
    const open = easeInOut(Math.min(t / 0.6, 1));
    const dive = easeInOut(THREE.MathUtils.clamp((t - 0.72) / 0.28, 0, 1));

    // THE CAMERA PULLS BACK AS THE BOOK OPENS, not in.
    //
    // The cover rotates about the spine at x = BOOK.spineX, so an open book is
    // roughly TWICE as wide as a closed one — it spans from about
    // `spineX - width` to `spineX + width`. Pushing in on open (the first pass)
    // meant the object grew while the frame shrank, and the spread ran off both
    // edges. Only the final dive moves closer, which is the one moment the
    // storyboard actually asks for.
    const z = THREE.MathUtils.lerp(8.6, 11.4, open) - dive * 3.4;
    const y = THREE.MathUtils.lerp(2.0, 1.3, open) - dive * 0.35;
    camera.position.set(THREE.MathUtils.lerp(1.4, 0.0, open), y, z);

    // …and it re-centres on the SPREAD. A closed book is centred near the
    // origin; an open one is centred on its spine, so a fixed lookAt would
    // leave the spread sitting off to one side for the whole second half.
    target.set(THREE.MathUtils.lerp(0, BOOK.spineX, open), 0, 0);
    camera.lookAt(target);
  });

  return null;
}

/** Frees GPU memory on unmount. R3F unmounts the tree; it does not dispose it. */
function Cleanup() {
  const { scene, gl } = useThree();
  useEffect(
    () => () => {
      disposeTree(scene);
      gl.dispose();
    },
    [scene, gl],
  );
  return null;
}

/**
 * Pauses the render loop whenever the canvas is off-screen.
 *
 * Without this the scene keeps rendering at 60fps while the reader is four
 * sections further down — the most expensive thing this page could do to a
 * phone, and completely invisible on a desktop check.
 */
function VisibilityGate({ active }: { active: boolean }) {
  const { invalidate, setFrameloop } = useThree();
  useEffect(() => {
    setFrameloop(active ? "always" : "never");
    if (active) invalidate();
  }, [active, invalidate, setFrameloop]);
  return null;
}

export default function NotebookScene({
  progress,
  active,
}: {
  progress: NotebookProgress;
  active: boolean;
}) {
  return (
    <Canvas
      // Clamped to 2: beyond that the fragment cost quadruples for detail no
      // one can see, and a modern phone reports 3.
      dpr={[1, 2]}
      camera={{ fov: 32, position: [1.4, 2.2, 9.2] }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        // NoToneMapping: R3F defaults to ACES Filmic, which is a film-grade
        // curve that pulled `--paper` (#f7f6f2) down to a mid grey. The design
        // system is flat and its colours are already the intended values, so
        // the renderer must not re-grade them — the notebook has to be the same
        // paper as the page behind it.
        toneMapping: THREE.NoToneMapping,
      }}
      // Transparent, so the scene sits on `--paper` and inherits the theme
      // rather than carrying a background that would have to be themed twice.
      style={{ background: "transparent" }}
    >
      <VisibilityGate active={active} />
      <Cleanup />
      <Rig progress={progress} />

      {/* Paper needs soft, directional light and almost no specular. Three
          lights, no environment map — an HDRI would be the single largest
          asset on the site. */}
      <ambientLight intensity={0.75} />
      {/* Key: high and to the front, so the cover carries a gradient instead of
          a flat fill and the fore edge catches a highlight. */}
      <directionalLight position={[4, 6, 5]} intensity={1.9} />
      {/* Fill, to keep the shadow side readable rather than black. */}
      <directionalLight position={[-5, 1, 2]} intensity={0.55} />
      {/* Rim, which is what separates the book from `--paper` behind it. */}
      <directionalLight position={[-2, 3, -6]} intensity={0.7} />

      <group rotation={[0.12, -0.22, 0]}>
        <Cover progress={progress} side="back" />
        <PageBlock />
        <Pages progress={progress} />
        <Tabs />
        <Cover progress={progress} side="front" />
      </group>
    </Canvas>
  );
}
