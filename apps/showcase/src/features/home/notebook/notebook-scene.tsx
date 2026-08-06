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
    const t = easeInOut(THREE.MathUtils.clamp(progress.current / 0.35, 0, 1));
    ref.current.rotation.y = -t * Math.PI * 0.82;
  });

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

function Tabs() {
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

    const z = THREE.MathUtils.lerp(8.6, 11.4, open) - dive * 3.4;
    const y = THREE.MathUtils.lerp(2.0, 1.3, open) - dive * 0.35;
    camera.position.set(THREE.MathUtils.lerp(1.4, 0.0, open), y, z);

    target.set(THREE.MathUtils.lerp(0, BOOK.spineX, open), 0, 0);
    camera.lookAt(target);
  });

  return null;
}

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
      dpr={[1, 2]}
      camera={{ fov: 32, position: [1.4, 2.2, 9.2] }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.NoToneMapping,
      }}
      style={{ background: "transparent" }}
    >
      <VisibilityGate active={active} />
      <Cleanup />
      <Rig progress={progress} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 6, 5]} intensity={1.9} />
      <directionalLight position={[-5, 1, 2]} intensity={0.55} />
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
