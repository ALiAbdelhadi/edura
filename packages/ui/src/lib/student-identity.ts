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
// So the uniqueness is carried by a GUILLOCHÉ — the engine-turned figure that
// has been the mark of a genuine document on banknotes, share certificates and
// identity cards for two centuries.
//
// ── WHY THIS FILE WAS REWRITTEN (2026-08-10) ───────────────────────────────
//
// The first version varied five parameters — two lobe counts, amplitude,
// phase, rotation — and Ali could not tell two cards apart. He was right, and
// the reason is worth writing down because it is a general one:
//
//   1. THE SILHOUETTE NEVER CHANGED. Every card drew one rosette, centred, at
//      the same radius. The eye identifies an object by its OUTLINE first and
//      its fine detail last, so "a round doily in the middle" was the only
//      thing anyone actually perceived. Changing a rosette from 7 lobes to 11
//      is invisible at arm's length; changing it from one centred medallion to
//      a full-width lathe band is unmistakable.
//   2. IT WAS DRAWN BELOW THE PERCEPTUAL FLOOR. Passes carried opacity
//      0.18–0.50 and BOTH renderers then multiplied by another 0.55 — an
//      effective 0.10–0.275 at 0.7px. Whatever variation existed was being
//      rendered in near-invisible ink.
//   3. ROTATION WAS A WASTED AXIS. An n-lobe rosette is symmetric under
//      2π/n, so rotating it produces a visually identical figure. One of the
//      five advertised axes contributed nothing at all.
//
// So the variation now happens where perception happens — COMPOSITION first,
// contrast second, fine detail last.
//
// ── THE PLATE IS THE UNIT OF DIFFERENCE ────────────────────────────────────
//
// A card is assigned one of four PLATES, the way a banknote series carries a
// rosette, lathe-work, a medallion pair. Two students on different plates are
// told apart across a room; two on the same plate still differ in lobe counts,
// depth, weight and the accent pair.
//
// ── EVERY PLATE IS SYMMETRIC ABOUT THE VERTICAL AXIS, AND THAT IS A RULE ───
//
// The card MIRRORS: Arabic runs from the right, English from the left. An
// engraving anchored to one side sits under the student's name in one of the
// two languages. So a plate may be centred, mirrored-in-pairs, or full-width —
// never anchored to a single side. This is why there is no corner medallion,
// which is otherwise the most obvious idea in the set.
//
// ── PROPERTIES THAT MATTER ─────────────────────────────────────────────────
//
// DETERMINISTIC. Same student, same plate, forever — on screen, in the PDF, in
// the PNG, on a card printed two years ago. Nothing is stored: the seed is the
// student's own id, so there is no column to migrate and no state to get out of
// step with the card in their pocket.
//
// PURE AND DEPENDENCY-FREE, AND NOW FULLY POSITIONED. `guillochePasses` returns
// passes that already carry their centre, radius, width, opacity and accent —
// so the SVG, the canvas and the print sheet are each a dumb loop over the same
// list. Placement used to live in the two renderers, hardcoded and identical,
// which is exactly why the composition could never vary: there was nowhere for
// a plate to be expressed. One generator, three renderers, no chance of drift.
// ===========================================================================

/** The four plates. Named for what a printer would call them. */
export type PlateKind = "medallion" | "twin" | "band" | "orbit";

export type StudentIdentity = {
  /** The dominant accent. Never a new hue — one of the permitted three. */
  tone: AccentName;
  /**
   * A SECOND permitted accent for the subordinate figure.
   *
   * Two-colour lathe work is the authentic device (every banknote does it) and
   * it multiplies distinctness without touching the palette: three accents give
   * six ordered pairs. It stays inside CONSTITUTION §4 because it is ORNAMENT
   * ONLY — the accent never touches a label or a figure, where colour carries
   * meaning (teal = money, amber = waiting). Always different from `tone`.
   */
  toneAlt: AccentName;
  /** Which plate this student's card is struck from. The big lever. */
  plate: PlateKind;
  /** Two superposed rosettes — the interference between them is the pattern. */
  rosettes: [Rosette, Rosette];
  /** Rotation of the whole engraving, in radians. */
  rotation: number;
  /**
   * Hairline weight, in card units. A heavier plate reads as a different card
   * even at the same geometry, and it is what a different engraving depth
   * would actually look like.
   */
  weight: number;
};

export type AccentName = "indigo" | "teal" | "amber";

export type Rosette = {
  /** Lobe count. The most visible axis of difference WITHIN a plate. */
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
const PLATES: PlateKind[] = ["medallion", "twin", "band", "orbit"];

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
    // WIDENED from 0.07–0.16. At the old depths the lobes were ripples; these
    // are petals, which is the difference between "a circle" and "a figure".
    amplitude: pick(seed, 2, 0.14, 0.30),
    phase: pick(seed, 3, 0, Math.PI * 2),
    strokes: pickInt(seed, 4, 7, 11),
    scale: 1,
  };
  const inner: Rosette = {
    // Offset from the outer count so the two never coincide — two identical
    // rosettes superpose into one, and the interference IS the pattern.
    lobes: outer.lobes + pickInt(seed, 5, 2, 7),
    amplitude: pick(seed, 6, 0.10, 0.24),
    phase: pick(seed, 7, 0, Math.PI * 2),
    strokes: pickInt(seed, 8, 5, 8),
    scale: pick(seed, 9, 0.48, 0.72),
  };

  const tone = TONES[hash32(seed, 10) % 3] as AccentName;
  // The alternate is drawn from the OTHER two, so a card is never two-tone in
  // name only.
  const others = TONES.filter((t) => t !== tone) as AccentName[];
  const toneAlt = others[hash32(seed, 12) % 2] as AccentName;

  return {
    tone,
    toneAlt,
    plate: PLATES[hash32(seed, 13) % PLATES.length] as PlateKind,
    rosettes: [outer, inner],
    rotation: pick(seed, 11, 0, Math.PI * 2),
    weight: pick(seed, 14, 0.55, 1.15),
  };
}

// ---------------------------------------------------------------------------
// Geometry. Two families: the rosette (engine-turned circle) and the wave
// (linear lathe work). Both return plain point lists so every renderer draws
// the same polyline.
// ---------------------------------------------------------------------------

/**
 * One pass of a rosette, sampled finely enough that the curve reads as a drawn
 * line rather than a polygon.
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

/**
 * Linear engine-turning — the guilloché BAND that runs across a banknote.
 *
 * Two superposed sines whose frequencies come from the two rosettes' lobe
 * counts, so a student's band and a student's medallion are the same figure
 * expressed in a different geometry rather than two unrelated patterns.
 */
export function wavePoints(
  r: Rosette,
  alt: Rosette,
  stroke: number,
  x0: number,
  x1: number,
  cy: number,
  height: number,
  samples = 520,
): [number, number][] {
  // Each pass is displaced vertically AND shifted in phase; the crossings
  // between passes are what make lathe work look woven rather than striped.
  const offset = ((stroke / Math.max(1, r.strokes - 1)) - 0.5) * height;
  const phase = r.phase + stroke * 0.22;

  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const x = x0 + (x1 - x0) * u;
    const t = u * Math.PI * 2;
    const y =
      cy +
      offset +
      height * 0.42 * r.amplitude * Math.sin(r.lobes * t + phase) +
      height * 0.30 * alt.amplitude * Math.sin(alt.lobes * t - phase * 1.7);
    pts.push([x, y]);
  }
  return pts;
}

/** The same rosette pass as an SVG path. Geometry comes from the points only. */
export function rosettePath(
  r: Rosette,
  stroke: number,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  samples = 480,
): string {
  return toPath(rosettePoints(r, stroke, cx, cy, radius, rotation, samples), true);
}

/** Points → an SVG `d`. One implementation, so no renderer rounds differently. */
export function toPath(pts: [number, number][], close = false): string {
  return (
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") +
    (close ? "Z" : "")
  );
}

// ---------------------------------------------------------------------------
// The plate, positioned.
// ---------------------------------------------------------------------------

export type GuillochePass = {
  /** Already-computed geometry. A renderer only strokes it. */
  points: [number, number][];
  /** Which accent this pass is drawn in. */
  tone: AccentName;
  /** Final alpha. NOT to be multiplied again by the renderer. */
  opacity: number;
  /** Final stroke width in card units. */
  width: number;
  /** Rosette passes close; wave passes do not. */
  closed: boolean;
};

/**
 * Every pass of the whole plate, positioned for a `w × h` card — the entire
 * engraving, described as DATA rather than as markup.
 *
 * The opacity here is FINAL. The previous version returned a value that both
 * renderers then multiplied by 0.55, which is how the engraving ended up at a
 * tenth of an alpha; a number that means "opacity" in one file and "half the
 * opacity" in two others is a bug waiting for someone to read only one of them.
 */
export function guillochePasses(
  identity: StudentIdentity,
  w: number,
  h: number,
): GuillochePass[] {
  const [outer, inner] = identity.rosettes;
  const out: GuillochePass[] = [];
  const cx = w / 2;
  const cy = h / 2;

  // Fades inward so the card stays readable where the text sits, without a
  // mask or a second surface behind it. Roughly DOUBLE the old effective
  // range (was 0.10–0.275 after the renderers' extra multiply).
  const fade = (stroke: number, strokes: number, top: number) =>
    top - (stroke / Math.max(1, strokes)) * (top * 0.62);

  /**
   * A rosette's OUTER ENVELOPE is `radius · scale · (1 + amplitude)`, not
   * `radius` — the lobes stick out past the base circle. Plates are therefore
   * sized by the envelope they must fit inside, and this converts back.
   *
   * Sizing by the base radius instead is what let a deep-lobed medallion push
   * 12px past the top edge, where the card's rounded clip sliced it into a flat
   * cut that reads as a rendering bug rather than a design. Caught by the
   * bleed assertion in student-identity.test.ts.
   */
  const fit = (r: Rosette, envelope: number) => envelope / (r.scale * (1 + r.amplitude));

  const ring = (
    r: Rosette,
    ccx: number,
    ccy: number,
    envelope: number,
    tone: AccentName,
    top: number,
    widthScale = 1,
  ) => {
    const radius = fit(r, envelope);
    for (let stroke = 0; stroke < r.strokes; stroke++) {
      out.push({
        points: rosettePoints(r, stroke, ccx, ccy, radius, identity.rotation),
        tone,
        opacity: fade(stroke, r.strokes, top),
        width: identity.weight * widthScale,
        closed: true,
      });
    }
  };

  switch (identity.plate) {
    // ── One large centred medallion. The classic share-certificate plate.
    case "medallion": {
      ring(outer, cx, cy, h * 0.40, identity.tone, 0.5);
      ring(inner, cx, cy, h * 0.27, identity.toneAlt, 0.44, 0.85);
      break;
    }

    // ── Two mirrored medallions. Symmetric, so it mirrors to itself in RTL.
    case "twin": {
      // TWO figures, not three. A centre rosette between them was a third
      // overlapping shape in the busiest part of the card and read as clutter
      // rather than as a plate; the pair IS the composition.
      const dx = w * 0.21;
      ring(outer, cx - dx, cy, h * 0.27, identity.tone, 0.46);
      ring(outer, cx + dx, cy, h * 0.27, identity.toneAlt, 0.46);
      break;
    }

    // ── Full-width linear lathe work. The most distinct silhouette in the set,
    // and the ONE plate that deliberately runs off the left and right edges —
    // a band stopping short of the trim would read as a mistake.
    case "band": {
      const strokes = outer.strokes + 4;
      for (let stroke = 0; stroke < strokes; stroke++) {
        out.push({
          points: wavePoints(
            { ...outer, strokes },
            inner,
            stroke,
            -w * 0.02,
            w * 1.02,
            cy,
            h * 0.34,
          ),
          tone: stroke % 3 === 2 ? identity.toneAlt : identity.tone,
          opacity: fade(stroke, strokes, 0.46),
          width: identity.weight,
          closed: false,
        });
      }
      break;
    }

    // ── A medallion ringed by satellites. Busiest, and unmistakable.
    case "orbit": {
      ring(outer, cx, cy, h * 0.25, identity.tone, 0.5);
      const satellites = 6;
      const orbit = Math.min(w, h * 1.45) * 0.30;
      for (let i = 0; i < satellites; i++) {
        // Started at -90° and stepped evenly, so the ring is symmetric about
        // the vertical axis and survives mirroring.
        const a = -Math.PI / 2 + (i / satellites) * Math.PI * 2;
        ring(
          inner,
          cx + Math.cos(a) * orbit,
          cy + Math.sin(a) * orbit * 0.62,
          h * 0.105,
          i % 2 ? identity.toneAlt : identity.tone,
          0.40,
          0.8,
        );
      }
      break;
    }
  }

  return out;
}
