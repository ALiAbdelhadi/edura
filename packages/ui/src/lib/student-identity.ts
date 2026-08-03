// ===========================================================================
// النقش — the engraving that makes one student's card theirs.
//
// WHY THIS IS NOT A GRADIENT. The brief asked for "a different gradient per
// student" so a student feels the card belongs to them. The design system
// forbids exactly that on student surfaces (CONSTITUTION §4, Warmth: "the
// permitted range is fills and tiles — never a new hue, never a gradient"),
// and the rule is right: a per-student hue would put a fifth, sixth,
// two-hundredth colour into a four-colour system.
//
// So the uniqueness is carried by a GUILLOCHÉ instead — the engine-turned
// rosette that has been the mark of a genuine document on banknotes, share
// certificates and identity cards for two centuries. It is drawn in the ink
// and the three permitted accents, it costs the palette nothing, and it is
// more distinctive per student than a gradient: a gradient varies on one axis
// (hue), this varies on five (two lobe counts, amplitude, phase, rotation).
//
// ── PROPERTIES THAT MATTER ─────────────────────────────────────────────────
//
// DETERMINISTIC. Same student, same pattern, forever — on screen, in the PDF,
// in the PNG, on a card printed two years ago. Nothing is stored: the seed is
// the student's own id, so there is no column to migrate and no state to get
// out of step with the card in their pocket.
//
// PURE AND DEPENDENCY-FREE. It returns numbers, not markup, so the same
// values drive the SVG on screen and the canvas that renders the PNG — one
// pattern, two renderers, no chance of them disagreeing.
// ===========================================================================

export type StudentIdentity = {
  /** One of the three permitted accents. Never a new hue. */
  tone: "indigo" | "teal" | "amber";
  /** Two superposed rosettes — the interference between them is the pattern. */
  rosettes: [Rosette, Rosette];
  /** Rotation of the whole engraving, in radians. */
  rotation: number;
};

export type Rosette = {
  /** Lobe count. The most visible axis of difference. */
  lobes: number;
  /** How deep the lobes cut, as a fraction of the radius. */
  amplitude: number;
  /** Where the first lobe starts, in radians. */
  phase: number;
  /** Concentric passes — what makes it read as engraved rather than drawn. */
  strokes: number;
  /** Radius as a fraction of the box. */
  scale: number;
};

const TONES = ["indigo", "teal", "amber"] as const;

/** FNV-1a. Chosen because it is four lines and identical everywhere. */
function hash32(seed: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic value in [min, max) from one salted draw on the seed. */
function pick(seed: string, salt: number, min: number, max: number): number {
  return min + (hash32(seed, salt) / 0x100000000) * (max - min);
}

function pickInt(seed: string, salt: number, min: number, maxInclusive: number): number {
  return min + (hash32(seed, salt) % (maxInclusive - min + 1));
}

export function studentIdentity(seed: string): StudentIdentity {
  const outer: Rosette = {
    lobes: pickInt(seed, 1, 5, 13),
    amplitude: pick(seed, 2, 0.07, 0.16),
    phase: pick(seed, 3, 0, Math.PI * 2),
    strokes: pickInt(seed, 4, 6, 9),
    scale: 1,
  };
  const inner: Rosette = {
    // Offset from the outer count so the two never coincide — two identical
    // rosettes superpose into one, and the interference IS the pattern.
    lobes: outer.lobes + pickInt(seed, 5, 2, 7),
    amplitude: pick(seed, 6, 0.05, 0.12),
    phase: pick(seed, 7, 0, Math.PI * 2),
    strokes: pickInt(seed, 8, 4, 7),
    scale: pick(seed, 9, 0.55, 0.74),
  };

  return {
    tone: TONES[hash32(seed, 10) % TONES.length] as StudentIdentity["tone"],
    rosettes: [outer, inner],
    rotation: pick(seed, 11, 0, Math.PI * 2),
  };
}

/**
 * One pass of a rosette as an SVG path, sampled finely enough that the curve
 * reads as a drawn line rather than a polygon.
 *
 * `stroke` selects which concentric pass this is (0 = outermost): each pass
 * sits slightly inside the last and is nudged in phase, which is what produces
 * the woven look of an engine-turned pattern rather than a stack of rings.
 */
export function rosettePoints(
  r: Rosette,
  stroke: number,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  samples = 480,
): [number, number][] {
  const shrink = 1 - (stroke / r.strokes) * 0.34;
  const phase = r.phase + stroke * 0.075;
  const base = radius * r.scale * shrink;

  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const rad = base * (1 + r.amplitude * Math.cos(r.lobes * t + phase));
    const a = t + rotation;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

/** The same pass as an SVG path. Geometry comes from `rosettePoints` only. */
export function rosettePath(
  r: Rosette,
  stroke: number,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  samples = 480,
): string {
  const pts = rosettePoints(r, stroke, cx, cy, radius, rotation, samples);
  return (
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") + "Z"
  );
}

export type GuillochePass = {
  rosette: Rosette;
  stroke: number;
  opacity: number;
};

/**
 * Every pass of both rosettes, outermost first — the whole engraving,
 * described as DATA rather than as markup.
 *
 * The SVG on screen and the canvas that renders the downloadable PNG both
 * consume this list, so the printed card and the shared image cannot drift
 * apart into two slightly different patterns.
 */
export function guillochePasses(identity: StudentIdentity): GuillochePass[] {
  const out: GuillochePass[] = [];
  for (const rosette of identity.rosettes) {
    for (let stroke = 0; stroke < rosette.strokes; stroke++) {
      out.push({
        rosette,
        stroke,
        // Fading inward keeps the card readable where the text sits, without
        // needing a mask or a second surface behind it.
        opacity: 0.5 - (stroke / rosette.strokes) * 0.32,
      });
    }
  }
  return out;
}
