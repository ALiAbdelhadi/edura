/**
 * Draw every brand icon that is NOT the mark itself, from the one geometry.
 *
 * Outputs: the notification icon and badge (PNG, see below), the PWA
 * maskable icon (SVG), and the wordmark (SVG). All four are committed build
 * artifacts — edit THIS file, never the outputs.
 *
 * ── THE WORDMARK WAS THE LAST STRAY ─────────────────────────────────────────
 * The favicon, the maskable icon and the notification assets were all redrawn
 * from `EDURA_MARK_PATHS` already. `edura-logo.svg` — the mark-plus-name used
 * on the invite-acceptance screen — was not: it was still the retired
 * EduConnect wordmark (a violet→indigo gradient tile, a second gradient for
 * the pin, a third for the "ra" of the name). Same bug as the notification
 * icons, smaller blast radius: one screen showing two different brands.
 *
 * ── WHY PNG AT ALL ─────────────────────────────────────────────────────────
 * `showNotification`'s `icon` and `badge` are the ONE place an SVG does not
 * work: Chrome on Android does not render SVG notification icons, and this is
 * an Android-first product. The worker pointed both at `/edura-mark.svg`, so
 * every push notification on the platform most of these families use arrived
 * with no icon and no badge at all. Nothing warns you — the notification just
 * shows the browser's generic glyph.
 *
 * ── ONE GEOMETRY, NOT A FIFTH COPY ─────────────────────────────────────────
 * The paths come from `@repo/ui/lib/edura-mark`, the same strings the student
 * card's SVG and its PNG exporter already draw. This script is another
 * CONSUMER of that geometry, not another copy of it.
 *
 * ── WHY THE ICON HAS A GROUND AND THE BADGE DOES NOT ───────────────────────
 * The icon is rendered in colour by the OS, on the notification shade — white
 * in a light theme, near-black in a dark one. Ink strokes on transparent would
 * vanish in dark mode, so the icon carries its own paper ground: the mark as it
 * appears on a page. No gradient, no invented hue — `--paper`, `--ink`,
 * `--gold`, exactly as the token sheet defines them.
 *
 * The badge is NOT rendered in colour. Android takes its ALPHA CHANNEL only and
 * tints the result white, so any ground would fill the whole square solid. It
 * is therefore the glyph alone on transparency — and drawn heavier, because a
 * badge renders at ~24dp where the hairline weight the card uses closes up into
 * a blur.
 *
 * ── THE MASKABLE ICON IS A TILE, AND THAT IS ALLOWED ───────────────────────
 * A maskable icon is cropped by the platform to a circle, squircle, rounded
 * rect or teardrop, so it MUST be full-bleed — transparency shows as white or
 * black corners on the home screen. CONSTITUTION §4 permits exactly this
 * ("the permitted range is fills and tiles"); what it forbids is a new hue and
 * a gradient, which is precisely what the file this replaces was: the retired
 * EduConnect violet→indigo gradient plus #00b473, three hues the Ledger palette
 * does not contain. The result was an installed app whose home-screen icon and
 * whose favicon were two different brands.
 *
 * Everything essential sits inside the 80%-diameter safe circle: the mark's
 * stroked extremities reach r=73.4 of 100 at full size, so it is scaled to
 * leave real margin rather than merely satisfying the rule (measured, not
 * guessed — see the safe-zone assertion in the test).
 *
 * Run: `bun run --cwd apps/www gen:icons`
 * `tests/unit/brand-icons.test.ts` holds the outputs present, correctly sized,
 * inside the safe zone, and actually referenced by the worker and the manifest.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  EDURA_MARK_PATHS,
  EDURA_MARK_STROKE,
  EDURA_MARK_VIEWBOX,
} from "@repo/ui/lib/edura-mark";

const PUBLIC_DIR = join(import.meta.dirname, "..", "public");

/** Light-mode Ledger tokens, literal: a PNG has no token sheet to read. */
const PAPER = "#f3f2f2";
const INK = "#201f1d";
const GOLD = "#b68235";

const ICON_SIZE = 192;
const BADGE_SIZE = 96;
/** iOS's own asset size for a home-screen icon. */
const APPLE_TOUCH_SIZE = 180;

/** A badge at ~24dp needs weight the card's hairlines do not have. */
const BADGE_STROKE_SCALE = 1.6;

/**
 * Glyph scale inside the maskable canvas. At 1.0 the mark's stroked corners sit
 * at r=73.4 against a safe-zone limit of 80 — compliant, but with 8% to spare,
 * and launchers crop differently. 0.84 puts them at r=61.7 and the glyph at
 * ~43% of the icon's width, which is the proportion an app icon wants anyway.
 */
const MASKABLE_GLYPH_SCALE = 0.84;

/**
 * The mark is authored with its optical centre one unit BELOW the canvas
 * centre (its own vertical midpoint is y=101). Centring it on a square the
 * platform will crop from every side means correcting that.
 */
const MASKABLE_GLYPH_CENTRE_Y = 101;

function markPaths(strokeScale: number, ink: string, gold: string): string {
  return EDURA_MARK_PATHS.map((p) => {
    const width =
      (p.light ? EDURA_MARK_STROKE.light : EDURA_MARK_STROKE.heavy) *
      strokeScale;
    return `<path d="${p.d}" stroke="${p.light ? gold : ink}" stroke-width="${width}" />`;
  }).join("\n    ");
}

function iconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${EDURA_MARK_VIEWBOX} ${EDURA_MARK_VIEWBOX}">
  <rect width="${EDURA_MARK_VIEWBOX}" height="${EDURA_MARK_VIEWBOX}" fill="${PAPER}" />
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${markPaths(1, INK, GOLD)}
  </g>
</svg>`;
}

function badgeSvg(): string {
  // One colour, because the alpha channel is all that survives.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${EDURA_MARK_VIEWBOX} ${EDURA_MARK_VIEWBOX}">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${markPaths(BADGE_STROKE_SCALE, "#ffffff", "#ffffff")}
  </g>
</svg>`;
}

function maskableSvg(): string {
  const v = EDURA_MARK_VIEWBOX;
  return `<svg viewBox="0 0 ${v} ${v}" xmlns="http://www.w3.org/2000/svg" fill="none" role="img" aria-label="Edura">
  <!-- GENERATED by scripts/generate-brand-icons.ts. Edit that, not this file.
       The Edura mark on its own paper, sized to survive a platform mask.
       Colours are LITERAL hex: a home-screen icon renders outside any document
       carrying the token sheet, so a CSS custom property would resolve to
       nothing. (Note for anyone editing this text: an XML comment may not
       contain a double hyphen, so the token names cannot be written here.) -->
  <rect width="${v}" height="${v}" fill="${PAPER}" />
  <g
    transform="translate(${v / 2} ${v / 2}) scale(${MASKABLE_GLYPH_SCALE}) translate(${-v / 2} ${-MASKABLE_GLYPH_CENTRE_Y})"
    fill="none"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${markPaths(1, INK, GOLD)}
  </g>
</svg>
`;
}

/**
 * The wordmark: the mark, undistorted at its own native coordinates, beside
 * the name in ink. No tile, no gradient — an engraved mark does not sit on a
 * filled tile, the same reasoning `edura-mark.ts` already gives for the card.
 * Serif, matching the Latin display face the rest of the product uses for the
 * wordmark (`--lat-display` / Cormorant) — literal, since this file has no
 * stylesheet to read the token from.
 */
function logoSvg(): string {
  const v = EDURA_MARK_VIEWBOX;
  return `<svg viewBox="0 0 520 ${v}" xmlns="http://www.w3.org/2000/svg" fill="none" role="img" aria-label="Edura">
  <!-- GENERATED by scripts/generate-brand-icons.ts. Edit that, not this file.
       The wordmark: the shared mark plus the name, in ink and gold. The file
       this replaced was the retired EduConnect wordmark — a violet-to-indigo
       tile plus two further gradients, none of which the Ledger palette
       contains. -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${markPaths(1, INK, GOLD)}
  </g>
  <text
    x="222"
    y="126"
    font-family="'Cormorant Garamond', Georgia, serif"
    font-weight="700"
    font-size="72"
    letter-spacing="-1"
    fill="${INK}"
  >Edura</text>
</svg>
`;
}

async function render(svg: string, size: number, file: string): Promise<void> {
  const png = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(PUBLIC_DIR, file), png);
  console.log(`wrote public/${file} — ${size}x${size}, ${png.length} bytes`);
}

await render(iconSvg(), ICON_SIZE, "notification-icon.png");
await render(badgeSvg(), BADGE_SIZE, "notification-badge.png");

const maskable = maskableSvg();
writeFileSync(join(PUBLIC_DIR, "edura-maskable.svg"), maskable);
console.log(`wrote public/edura-maskable.svg — ${maskable.length} bytes`);

/**
 * iOS Safari does not support SVG for `apple-touch-icon`, so "Add to Home
 * Screen" on an iPhone produced a blank tile while Android showed the mark.
 * It also composites the icon on white and rounds the corners ITSELF, so this
 * ships opaque and unrounded — the same paper tile as the maskable, at the
 * 180×180 iOS asks for.
 */
await render(maskableSvg(), APPLE_TOUCH_SIZE, "apple-touch-icon.png");

const logo = logoSvg();
writeFileSync(join(PUBLIC_DIR, "edura-logo.svg"), logo);
console.log(`wrote public/edura-logo.svg — ${logo.length} bytes`);
