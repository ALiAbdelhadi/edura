import * as THREE from "three";

/**
 * ============================================================================
 * الدفتر — the notebook, built procedurally.
 * ============================================================================
 * No GLTF, no texture, no HDRI. Every one of those is a network request AND
 * bundle weight on a page whose whole Phase 5 gate is a byte budget, and a
 * ledger notebook is a box, a hinged cover, some sheets and five tabs — it does
 * not need an artist's mesh to be right.
 *
 * The look comes from the design tokens, not from shaders: `--paper` for the
 * sheets, `--indigo` for the cover, `--teal` and the rest for the role tabs.
 * "Physical paper, not flashy" is the brief, and a MeshStandardMaterial with a
 * high roughness and no metalness is what paper actually is.
 *
 * COLOURS ARE READ FROM CSS, NOT RESTATED HERE
 * ----------------------------------------------------------------------------
 * A hard-coded `0x1a2f73` would be a fourth place the palette lives and the
 * first one to drift when dark mode or a token correction lands. These read the
 * computed custom properties off the document, so the 3D object is the same
 * indigo as the button beside it, in whichever theme is active.
 */

export const ROLE_TABS = [
  // The owners tab is indigo-SOFT, not `--indigo`: the cover is `--indigo`, so
  // the matching tab was invisible against it while the book was closed — the
  // state the reader sees first.
  { key: "owners", token: "--indigo-soft" },
  { key: "teachers", token: "--teal" },
  { key: "students", token: "--amber" },
  { key: "parents", token: "--red" },
  { key: "trust", token: "--ink-2" },
] as const;

export type RoleTabKey = (typeof ROLE_TABS)[number]["key"];

/** Reads a CSS custom property and parses it as a colour. */
export function tokenColor(name: string, fallback: string): THREE.Color {
  if (typeof window === "undefined") return new THREE.Color(fallback);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new THREE.Color(raw || fallback);
  } catch {
    // A token expressed in a colour space three cannot parse (oklab/color-mix)
    // must not take the scene down with it.
    return new THREE.Color(fallback);
  }
}

/** Page count. Enough to read as a book, few enough to stay cheap. */
export const PAGE_COUNT = 7;

export const BOOK = {
  width: 2.6,
  height: 3.4,
  coverThickness: 0.06,
  pageThickness: 0.012,
  /** How far the spine sits from the origin, so the book opens around it. */
  spineX: -1.3,
  /**
   * The visible block of paper at the fore edge. Without it the closed book is
   * a solid indigo slab — the one thing on screen that should read as PAPER
   * reads as plastic, which is the opposite of what the object is claiming.
   */
  blockDepth: PAGE_COUNT_DEPTH(),
} as const;

/** Total thickness of the page stack, so the block matches the pages exactly. */
function PAGE_COUNT_DEPTH() {
  return 7 * 0.012 + 0.02;
}

/**
 * Where a page sits in the flip sequence.
 *
 * Pages flip one after another across the scroll, each taking a slice of the
 * timeline with a slight overlap so the motion reads as a fan rather than as
 * seven discrete events.
 */
export function pageFlipProgress(index: number, total: number, t: number): number {
  const slice = 1 / total;
  const overlap = slice * 0.45;
  const start = index * (slice - overlap / total);
  const end = start + slice + overlap;
  return THREE.MathUtils.clamp((t - start) / (end - start), 0, 1);
}

/** Ease used for every rotation in the scene. Smooth in, settled out. */
export function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/**
 * Disposes every geometry, material and texture reachable from a root.
 *
 * R3F removes objects from the scene graph on unmount but does NOT free their
 * GPU resources — on a route change that is a leak that survives until the tab
 * closes, and this scene is the heaviest thing the site allocates.
 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
    else material?.dispose?.();
  });
}
