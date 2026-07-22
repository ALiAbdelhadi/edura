/**
 * Cloudinary DELIVERY layer — pure, isomorphic, dependency-free.
 *
 * Nothing here needs a secret: a transformation is just a path segment in the
 * delivery URL, so the browser can build it. That is the whole efficiency
 * story — instead of shipping the 2 MB original everywhere, every surface asks
 * Cloudinary for exactly the pixels it renders, in the best format the visitor's
 * browser supports:
 *
 *   .../image/upload/f_auto,q_auto,c_fill,g_auto,w_96,h_96,dpr_2/edura/avatars/<id>
 *
 *   f_auto  → AVIF/WebP where supported, JPEG elsewhere (~30-60% smaller)
 *   q_auto  → perceptual quality targeting, per image
 *   w_/h_   → resize at the CDN edge; the origin is fetched once and cached
 *   dpr_    → retina without doubling the cost for everyone else
 *
 * Both a bare public_id and an already-stored `secure_url` are accepted, so
 * rows written before this layer existed (room photos, pasted logo URLs) get
 * the same treatment with no migration.
 */

export type CldCrop = "fill" | "fit" | "limit" | "thumb" | "scale" | "pad";
export type CldGravity = "auto" | "face" | "faces" | "center";
export type CldFormat = "auto" | "webp" | "avif" | "jpg" | "png";

export type CldOptions = {
  width?: number;
  height?: number;
  crop?: CldCrop;
  gravity?: CldGravity;
  /** Device pixel ratio. Omit to let the caller supply a srcSet instead. */
  dpr?: number | "auto";
  quality?: number | "auto" | "auto:good" | "auto:eco" | "auto:low";
  format?: CldFormat;
  /** `max` = fully round (avatars). */
  radius?: number | "max";
  blur?: number;
  /** Padding colour for crop "pad" (e.g. "white", "rgb:00000000" for transparent). */
  background?: string;
};

const CLOUDINARY_HOST = "res.cloudinary.com";

// Module-scoped declaration: @repo/ui carries no @types/node, and the literal
// `process.env.NEXT_PUBLIC_*` text is what Next's bundler statically replaces —
// reading it through globalThis would silently break the browser build.
declare const process: { env: Record<string, string | undefined> } | undefined;

export function cloudinaryCloudName(): string | null {
  // NEXT_PUBLIC_* is inlined at build time, so this is safe in the browser.
  if (typeof process === "undefined") return null;
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? null;
}

export function isCloudinaryUrl(src: string | null | undefined): boolean {
  return typeof src === "string" && src.includes(`${CLOUDINARY_HOST}/`);
}

/** Build the `f_auto,q_auto,c_fill,…` transformation segment. */
export function buildTransform(opts: CldOptions = {}): string {
  const parts: string[] = [];
  // Format and quality lead, and default to auto — the single biggest win, and
  // the one that is easy to forget at the call site.
  parts.push(`f_${opts.format ?? "auto"}`);
  parts.push(`q_${opts.quality ?? "auto"}`);
  if (opts.crop) parts.push(`c_${opts.crop}`);
  if (opts.gravity) parts.push(`g_${opts.gravity}`);
  if (opts.width) parts.push(`w_${Math.round(opts.width)}`);
  if (opts.height) parts.push(`h_${Math.round(opts.height)}`);
  if (opts.dpr) parts.push(`dpr_${opts.dpr}`);
  if (opts.radius !== undefined) parts.push(`r_${opts.radius}`);
  if (opts.blur) parts.push(`e_blur:${opts.blur}`);
  if (opts.background) parts.push(`b_${opts.background}`);
  return parts.join(",");
}

/**
 * Turn a public_id OR an existing Cloudinary URL into a transformed URL.
 * Non-Cloudinary URLs (external avatars, data: URIs) pass through untouched.
 */
export function cldUrl(
  src: string | null | undefined,
  opts: CldOptions = {},
  resourceType: "image" | "video" = "image",
): string | null {
  if (!src) return null;
  const transform = buildTransform(opts);

  if (isCloudinaryUrl(src)) {
    // Insert our segment right after `/upload/`. Any transformation already in
    // the URL simply chains after ours, which is valid Cloudinary syntax.
    return src.replace(/\/upload\//, `/upload/${transform}/`);
  }

  // Anything else absolute is externally hosted — leave it alone.
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }

  const cloud = cloudinaryCloudName();
  if (!cloud) return src;
  const publicId = src.replace(/^\/+/, "");
  return `https://${CLOUDINARY_HOST}/${cloud}/${resourceType}/upload/${transform}/${publicId}`;
}

/**
 * Responsive `srcSet`. Prefer this over `dpr_auto` when the rendered width
 * varies with the viewport — the browser then picks the cheapest candidate it
 * actually needs.
 */
export function cldSrcSet(
  src: string | null | undefined,
  widths: number[],
  opts: CldOptions = {},
): string | undefined {
  if (!src || !isCloudinaryUrl(src)) return undefined;
  const entries = widths
    .map((w) => {
      const url = cldUrl(src, {
        ...opts,
        width: w,
        // Keep the aspect ratio of the base request across the whole set.
        height: opts.width && opts.height ? Math.round((opts.height / opts.width) * w) : undefined,
      });
      return url ? `${url} ${w}w` : null;
    })
    .filter((entry): entry is string => entry !== null);
  return entries.length ? entries.join(", ") : undefined;
}

/**
 * A ~1 KB blurred stand-in for the same asset, for use as a CSS background
 * behind the real <img> while it loads (LQIP). Costs one extra tiny request
 * and removes the layout flash on slow mobile connections.
 */
export function cldPlaceholder(src: string | null | undefined): string | null {
  if (!src || !isCloudinaryUrl(src)) return null;
  return cldUrl(src, { width: 24, crop: "fill", quality: "auto:low", blur: 400 });
}

/**
 * `next/image` custom loader. Wiring this into `next.config.ts` makes Next
 * delegate resizing to Cloudinary instead of re-optimizing an already-optimized
 * asset on our own server (and removes the need for `images.remotePatterns`).
 *
 * Not used by <CldImage>, which renders a plain <img> — but exported so any
 * existing next/image call site can opt in with one line.
 */
export function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  return cldUrl(src, { width, quality: quality ?? "auto", crop: "limit" }) ?? src;
}

/** Ready-made presets so surfaces stay consistent and nobody re-derives them. */
export const CLD_PRESETS = {
  /** Square, face-aware avatar. `size` is the CSS pixel size. */
  avatar: (size: number): CldOptions => ({
    width: size,
    height: size,
    crop: "fill",
    gravity: "face",
    dpr: 2,
  }),
  /** Logo: fit inside the box, never cropped, transparency preserved. */
  logo: (width: number, height?: number): CldOptions => ({
    width,
    height: height ?? width,
    crop: "fit",
    dpr: 2,
  }),
  /** Wide banner / cover image. */
  cover: (width: number, height: number): CldOptions => ({
    width,
    height,
    crop: "fill",
    gravity: "auto",
  }),
  /** Gallery thumbnail (room photos, etc.). */
  thumb: (width: number, height: number): CldOptions => ({
    width,
    height,
    crop: "fill",
    gravity: "auto",
  }),
} as const;
