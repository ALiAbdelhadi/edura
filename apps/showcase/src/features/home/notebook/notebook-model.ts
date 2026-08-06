import * as THREE from "three";

export const ROLE_TABS = [
  { key: "owners", token: "--indigo-soft" },
  { key: "teachers", token: "--teal" },
  { key: "students", token: "--amber" },
  { key: "parents", token: "--red" },
  { key: "trust", token: "--ink-2" },
] as const;

export type RoleTabKey = (typeof ROLE_TABS)[number]["key"];

export function tokenColor(name: string, fallback: string): THREE.Color {
  if (typeof window === "undefined") return new THREE.Color(fallback);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new THREE.Color(raw || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

export const PAGE_COUNT = 7;

export const BOOK = {
  width: 2.6,
  height: 3.4,
  coverThickness: 0.06,
  pageThickness: 0.012,
  spineX: -1.3,
  blockDepth: PAGE_COUNT_DEPTH(),
} as const;

function PAGE_COUNT_DEPTH() {
  return 7 * 0.012 + 0.02;
}

export function pageFlipProgress(index: number, total: number, t: number): number {
  const slice = 1 / total;
  const overlap = slice * 0.45;
  const start = index * (slice - overlap / total);
  const end = start + slice + overlap;
  return THREE.MathUtils.clamp((t - start) / (end - start), 0, 1);
}

export function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
    else material?.dispose?.();
  });
}
