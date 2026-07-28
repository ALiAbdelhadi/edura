import {
  deleteResource,
  isCloudinaryConfigured,
  publicIdFromUrl,
  uploadBuffer,
  type UploadedAsset,
} from "./cloudinary";

/**
 * Image ingest rules — shared by every image surface (center logos, teacher /
 * user photos, room photos, and whatever comes next).
 *
 * Two guarantees this module exists to enforce:
 *  1. **Magic bytes, not the client's Content-Type** — same rule the M6 audit
 *     finding imposed on material PDFs. A `.jpg` filename or an `image/png`
 *     header is attacker-controlled; the first bytes of the buffer are not.
 *  2. **Deterministic public_ids** — an entity's image always lands on the same
 *     public_id (`edura/<kind>/<entityId>`), uploaded with overwrite+invalidate.
 *     Replacing a photo therefore REPLACES the stored asset instead of leaving
 *     an orphan behind, so the Cloudinary account does not grow without bound.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";

const EXT_BY_MIME: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Sniff the real image type from the leading bytes. null = not an image. */
export function detectImageType(buffer: Buffer): ImageMime | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) return "image/gif";
  // RIFF container: "RIFF"…"WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO-BMFF container: box type "ftyp" with an AVIF brand.
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

export function extensionFor(mime: ImageMime): string {
  return EXT_BY_MIME[mime];
}

/**
 * Why an image was refused. The English `message` is for logs; this code is
 * what a UI translates, so a localized surface never has to string-match.
 */
export type ImageRejectionReason = "image_too_large" | "unsupported_image_type";

export class ImageValidationError extends Error {
  constructor(
    message: string,
    readonly reason: ImageRejectionReason,
    /** Context the UI may interpolate, e.g. the limit that was exceeded. */
    readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type ValidatedImage = { buffer: Buffer; mime: ImageMime; extension: string };

/** Read a `File` off a multipart body and validate size + real type. */
export async function validateImageFile(
  file: File,
  { maxBytes = MAX_IMAGE_BYTES }: { maxBytes?: number } = {},
): Promise<ValidatedImage> {
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  if (file.size > maxBytes) {
    throw new ImageValidationError(`Image is too large (max ${maxMb} MB)`, "image_too_large", {
      maxMb,
    });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectImageType(buffer);
  if (!mime) {
    throw new ImageValidationError(
      "Only JPEG, PNG, WebP, GIF, or AVIF images are accepted",
      "unsupported_image_type",
    );
  }
  return { buffer, mime, extension: EXT_BY_MIME[mime] };
}

/**
 * What an image is FOR. The kind drives the storage folder and the
 * store-time transformation, so callers never hand-roll either.
 *
 * `storeTransform` is applied by Cloudinary BEFORE the asset is persisted: it
 * caps what we pay to store and what a cold cache has to fetch. Delivery-time
 * resizing still happens per-surface via @repo/ui/lib/cloudinary.
 */
export type ImageKind = "avatar" | "logo" | "cover" | "photo";

const KIND_CONFIG: Record<ImageKind, { folder: string; storeTransform: string }> = {
  // Square, face-aware, 1024² is plenty for the largest avatar we render.
  avatar: { folder: "edura/avatars", storeTransform: "c_limit,w_1024,h_1024,q_auto:good" },
  // Logos keep their aspect ratio and may be transparent PNGs — no crop.
  logo: { folder: "edura/logos", storeTransform: "c_limit,w_1024,h_1024,q_auto:good" },
  cover: { folder: "edura/covers", storeTransform: "c_limit,w_2048,h_1152,q_auto:good" },
  photo: { folder: "edura/photos", storeTransform: "c_limit,w_2048,h_2048,q_auto:good" },
};

export function imageFolder(kind: ImageKind): string {
  return KIND_CONFIG[kind].folder;
}

/**
 * Upload an entity's image to its deterministic slot.
 *
 * `entityKey` must be stable for the entity (a uuid). `variant` distinguishes
 * multiple images of the same kind on one entity (e.g. room photos) — omit it
 * for the singular ones (avatar, logo) so re-upload overwrites in place.
 */
export async function uploadEntityImage(
  image: ValidatedImage,
  opts: { kind: ImageKind; entityKey: string; variant?: string; tags?: string[] },
): Promise<UploadedAsset> {
  const { folder, storeTransform } = KIND_CONFIG[opts.kind];
  const publicId = opts.variant ? `${opts.entityKey}_${opts.variant}` : opts.entityKey;
  return uploadBuffer(image.buffer, {
    folder,
    public_id: publicId,
    resource_type: "image",
    contentType: image.mime,
    filename: `${opts.kind}.${image.extension}`,
    overwrite: true,
    invalidate: true,
    transformation: storeTransform,
    tags: opts.tags,
  });
}

/**
 * Best-effort delete of a previously stored image URL. Silently ignores
 * non-Cloudinary URLs (externally hosted, not ours to delete) and network
 * failures — an orphaned asset must never fail the user's request.
 */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url || !isCloudinaryConfigured()) return;
  const publicId = publicIdFromUrl(url);
  if (!publicId) return;
  await deleteResource(publicId, "image").catch(() => {});
}

/**
 * Delete the asset an image field used to point at, once it points elsewhere.
 *
 * Lives here, not in either app, because BOTH the upload services and the
 * plain `{ logoUrl }` PATCH endpoints have to apply the identical rule — and
 * the PATCH endpoints are exactly where it was missing, so a center could
 * strand its old logo in the account by pasting a new URL.
 *
 * Two cases must NOT delete:
 *  - the URL did not actually change;
 *  - both URLs resolve to the same public_id (a re-upload overwrote the asset
 *    in place, or the new URL is just a transformed variant of the same one).
 *    Deleting there would erase the image the row now points at.
 */
export async function deleteReplacedImage(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
): Promise<void> {
  if (!previousUrl || previousUrl === nextUrl) return;
  const previousId = publicIdFromUrl(previousUrl);
  const nextId = nextUrl ? publicIdFromUrl(nextUrl) : null;
  if (previousId && previousId === nextId) return;
  await deleteImageByUrl(previousUrl);
}

export { isCloudinaryConfigured, publicIdFromUrl };
