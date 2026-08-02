/**
 * ============================================================================
 * SHOT OPTIMISER — PNG → AVIF + WebP, and the sizes that keep the perf gate.
 * ============================================================================
 * Playwright writes 2× PNGs (~200 KB each, ~20 MB for a full run). Shipping
 * those is how a marketing site quietly becomes the heavy thing it is selling
 * against, so every capture is re-encoded here and the PNGs are treated as
 * intermediates that never reach `next/image`.
 *
 * Two formats, in the order next/image will offer them:
 *   • AVIF — smallest, and what a modern browser takes.
 *   • WebP — the fallback, universally supported.
 * The PNG is deliberately NOT deleted: it is the losslessly-captured original,
 * and re-encoding from a lossy intermediate on the next tweak would compound
 * artefacts. `public/shots/**` is gitignored except the encoded outputs.
 *
 * Two widths per shot:
 *   • 1440 — the CSS width the shot was taken at, so a full-bleed scene is 1:1.
 *   • 720  — for cards, device frames and the mobile layout.
 * Anything larger would only ever be downscaled by the browser.
 *
 *   bun run optimize:shots
 */
import sharp, { type Sharp } from "sharp";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SHOTS = path.resolve(import.meta.dirname, "../public/shots");
const WIDTHS = [1440, 720] as const;

// Screenshots are flat UI: large areas of one colour, hairline rules, and text.
// Quality is set where the hairlines survive — an over-compressed `--rule` at
// 1px is the first thing to vanish and it is the design system's structural
// element, so this is not a knob to turn down for bytes.
const AVIF = { quality: 62, effort: 6 } as const;
const WEBP = { quality: 82, effort: 6 } as const;

type Row = {
  source: string;
  width: number;
  format: string;
  bytes: number;
  file: string;
};

async function main() {
  const roles = (await readdir(SHOTS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (roles.length === 0) {
    console.error("No shots found. Run `bun run capture` first.");
    process.exitCode = 1;
    return;
  }

  const rows: Row[] = [];
  let pngBytes = 0;

  for (const role of roles) {
    const dir = path.join(SHOTS, role);
    const pngs = (await readdir(dir)).filter((f) => f.endsWith(".png"));
    const outDir = path.join(dir, "opt");
    await mkdir(outDir, { recursive: true });

    for (const png of pngs) {
      const src = path.join(dir, png);
      pngBytes += (await stat(src)).size;
      const stem = png.replace(/\.png$/, "");
      const input = await readFile(src);

      for (const width of WIDTHS) {
        // `withoutEnlargement` matters: a 2× capture is 2880px wide, so 1440
        // and 720 are both downscales — but a future narrower capture must not
        // be upscaled into a blurry asset.
        const base = sharp(input).resize({ width, withoutEnlargement: true });

        for (const [ext, encode] of [
          ["avif", (s: Sharp) => s.avif(AVIF)],
          ["webp", (s: Sharp) => s.webp(WEBP)],
        ] as const) {
          const file = `${stem}.${width}.${ext}`;
          const buf = await encode(base.clone()).toBuffer();
          await writeFile(path.join(outDir, file), buf);
          rows.push({
            source: `${role}/${png}`,
            width,
            format: ext,
            bytes: buf.length,
            file: `shots/${role}/opt/${file}`,
          });
        }
      }
    }
  }

  await writeFile(
    path.join(SHOTS, "optimized.json"),
    `${JSON.stringify({ widths: WIDTHS, avif: AVIF, webp: WEBP, assets: rows }, null, 2)}\n`,
  );

  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const by = (fmt: string, w: number) =>
    rows.filter((r) => r.format === fmt && r.width === w).reduce((a, r) => a + r.bytes, 0);

  console.log(`Sources : ${rows.length / (WIDTHS.length * 2)} PNGs, ${kb(pngBytes)} total`);
  for (const w of WIDTHS) {
    console.log(`  ${w}px  avif ${kb(by("avif", w)).padStart(8)}   webp ${kb(by("webp", w)).padStart(8)}`);
  }
  const shipped = by("avif", 1440) + by("avif", 720);
  console.log(
    `\nAVIF at both widths: ${kb(shipped)} — ${(shipped / pngBytes * 100).toFixed(1)}% of the PNG bytes.`,
  );
  console.log("These are lazily loaded per scene, not all at once; the budget is per page.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
