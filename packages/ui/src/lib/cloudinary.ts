export type CldCrop = "fill" | "fit" | "limit" | "thumb" | "scale" | "pad";
export type CldGravity = "auto" | "face" | "faces" | "center";
export type CldFormat = "auto" | "webp" | "avif" | "jpg" | "png";

export type CldOptions = {
  width?: number;
  height?: number;
  crop?: CldCrop;
  gravity?: CldGravity;
  dpr?: number | "auto";
  quality?: number | "auto" | "auto:good" | "auto:eco" | "auto:low";
  format?: CldFormat;
  radius?: number | "max";
  blur?: number;
  background?: string;
};

const CLOUDINARY_HOST = "res.cloudinary.com";

declare const process: { env: Record<string, string | undefined> } | undefined;

export function cloudinaryCloudName(): string | null {
  if (typeof process === "undefined") return null;
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? null;
}

export function isCloudinaryUrl(src: string | null | undefined): boolean {
  return typeof src === "string" && src.includes(`${CLOUDINARY_HOST}/`);
}

export function buildTransform(opts: CldOptions = {}): string {
  const parts: string[] = [];
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

export function cldUrl(
  src: string | null | undefined,
  opts: CldOptions = {},
  resourceType: "image" | "video" = "image",
): string | null {
  if (!src) return null;
  const transform = buildTransform(opts);

  if (isCloudinaryUrl(src)) {
    return src.replace(/\/upload\//, `/upload/${transform}/`);
  }

  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }

  const cloud = cloudinaryCloudName();
  if (!cloud) return src;
  const publicId = src.replace(/^\/+/, "");
  return `https://${CLOUDINARY_HOST}/${cloud}/${resourceType}/upload/${transform}/${publicId}`;
}

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
        height: opts.width && opts.height ? Math.round((opts.height / opts.width) * w) : undefined,
      });
      return url ? `${url} ${w}w` : null;
    })
    .filter((entry): entry is string => entry !== null);
  return entries.length ? entries.join(", ") : undefined;
}

export function cldPlaceholder(src: string | null | undefined): string | null {
  if (!src || !isCloudinaryUrl(src)) return null;
  return cldUrl(src, { width: 24, crop: "fill", quality: "auto:low", blur: 400 });
}

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

export const CLD_PRESETS = {
  avatar: (size: number): CldOptions => ({
    width: size,
    height: size,
    crop: "fill",
    gravity: "face",
    dpr: 2,
  }),
  logo: (width: number, height?: number): CldOptions => ({
    width,
    height: height ?? width,
    crop: "fit",
    dpr: 2,
  }),
  cover: (width: number, height: number): CldOptions => ({
    width,
    height,
    crop: "fill",
    gravity: "auto",
  }),
  thumb: (width: number, height: number): CldOptions => ({
    width,
    height,
    crop: "fill",
    gravity: "auto",
  }),
} as const;
