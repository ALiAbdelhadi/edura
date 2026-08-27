export type PlateKind = "medallion" | "twin" | "band" | "orbit";

export type StudentIdentity = {
  tone: AccentName;
  toneAlt: AccentName;
  plate: PlateKind;
  rosettes: [Rosette, Rosette];
  rotation: number;
  weight: number;
};

export type AccentName = "indigo" | "teal" | "amber";

export type Rosette = {
  lobes: number;
  amplitude: number;
  phase: number;
  strokes: number;
  scale: number;
};

const TONES = ["indigo", "teal", "amber"] as const;
const PLATES: PlateKind[] = ["medallion", "twin", "band", "orbit"];

function hash32(seed: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick(seed: string, salt: number, min: number, max: number): number {
  return min + (hash32(seed, salt) / 0x100000000) * (max - min);
}

function pickInt(seed: string, salt: number, min: number, maxInclusive: number): number {
  return min + (hash32(seed, salt) % (maxInclusive - min + 1));
}

export function studentIdentity(seed: string): StudentIdentity {
  const outer: Rosette = {
    lobes: pickInt(seed, 1, 5, 13),
    amplitude: pick(seed, 2, 0.14, 0.30),
    phase: pick(seed, 3, 0, Math.PI * 2),
    strokes: pickInt(seed, 4, 7, 11),
    scale: 1,
  };
  const inner: Rosette = {
    lobes: outer.lobes + pickInt(seed, 5, 2, 7),
    amplitude: pick(seed, 6, 0.10, 0.24),
    phase: pick(seed, 7, 0, Math.PI * 2),
    strokes: pickInt(seed, 8, 5, 8),
    scale: pick(seed, 9, 0.48, 0.72),
  };

  const tone = TONES[hash32(seed, 10) % 3] as AccentName;
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

export function toPath(pts: [number, number][], close = false): string {
  return (
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") +
    (close ? "Z" : "")
  );
}

export type GuillochePass = {
  points: [number, number][];
  tone: AccentName;
  opacity: number;
  width: number;
  closed: boolean;
};

export function guillochePasses(
  identity: StudentIdentity,
  w: number,
  h: number,
): GuillochePass[] {
  const [outer, inner] = identity.rosettes;
  const out: GuillochePass[] = [];
  const cx = w / 2;
  const cy = h / 2;

  const fade = (stroke: number, strokes: number, top: number) =>
    top - (stroke / Math.max(1, strokes)) * (top * 0.62);

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
    case "medallion": {
      ring(outer, cx, cy, h * 0.40, identity.tone, 0.5);
      ring(inner, cx, cy, h * 0.27, identity.toneAlt, 0.44, 0.85);
      break;
    }

    case "twin": {
      const dx = w * 0.21;
      ring(outer, cx - dx, cy, h * 0.27, identity.tone, 0.46);
      ring(outer, cx + dx, cy, h * 0.27, identity.toneAlt, 0.46);
      break;
    }

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

    case "orbit": {
      ring(outer, cx, cy, h * 0.25, identity.tone, 0.5);
      const satellites = 6;
      const orbit = Math.min(w, h * 1.45) * 0.30;
      for (let i = 0; i < satellites; i++) {
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
