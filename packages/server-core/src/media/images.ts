import { isCloudinaryConfigured, publicIdFromUrl } from "./cloudinary";
import { resolveMediaDriver, type DeleteOutcome, type MediaImageFit, type StoredMedia } from "./storage";

export const PLATFORM_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";

const EXT_BY_MIME: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const ACCEPTED_IMAGE_MIMES: readonly ImageMime[] = Object.keys(EXT_BY_MIME) as ImageMime[];

export function detectImageType(buffer: Buffer): ImageMime | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) return "image/gif";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

export function extensionFor(mime: ImageMime): string {
  return EXT_BY_MIME[mime];
}

export type ImageRejectionReason = "image_too_large" | "unsupported_image_type";

export class ImageValidationError extends Error {
  constructor(
    message: string,
    readonly reason: ImageRejectionReason,
    readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type ValidatedImage = { buffer: Buffer; mime: ImageMime; extension: string };

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

export type ImageKind = "avatar" | "logo" | "cover" | "photo";

const KIND_CONFIG: Record<ImageKind, { folder: string; fit: MediaImageFit }> = {
  avatar: { folder: "edura/avatars", fit: { maxWidth: 1024, maxHeight: 1024, quality: "good" } },
  logo: { folder: "edura/logos", fit: { maxWidth: 1024, maxHeight: 1024, quality: "good" } },
  cover: { folder: "edura/covers", fit: { maxWidth: 2048, maxHeight: 1152, quality: "good" } },
  photo: { folder: "edura/photos", fit: { maxWidth: 2048, maxHeight: 2048, quality: "good" } },
};

export function imageFolder(kind: ImageKind): string {
  return KIND_CONFIG[kind].folder;
}

function slotId(entityKey: string, variant?: string): string {
  return variant ? `${entityKey}_${variant}` : entityKey;
}

export function imageSlot(kind: ImageKind, entityKey: string, variant?: string): string {
  return `${KIND_CONFIG[kind].folder}/${slotId(entityKey, variant)}`;
}

export async function uploadEntityImage(
  image: ValidatedImage,
  opts: { kind: ImageKind; entityKey: string; variant?: string; tags?: string[] },
): Promise<StoredMedia> {
  const { folder, fit } = KIND_CONFIG[opts.kind];
  return resolveMediaDriver().upload(image.buffer, {
    folder,
    public_id: slotId(opts.entityKey, opts.variant),
    resource_type: "image",
    contentType: image.mime,
    filename: `${opts.kind}.${image.extension}`,
    overwrite: true,
    invalidate: true,
    fit,
    tags: opts.tags,
  });
}

export type OwnedSlot = { owned: string };

function isOwned(publicId: string, owned: string): boolean {
  return owned.endsWith("/") ? publicId.startsWith(owned) : publicId === owned;
}

export async function deleteImageByUrl(
  url: string | null | undefined,
  { owned }: OwnedSlot,
): Promise<DeleteOutcome | "skipped"> {
  if (!url) return "skipped";
  const media = resolveMediaDriver();
  if (!media.uploadsEnabled()) return "skipped";
  const publicId = media.publicIdFromUrl(url);
  if (!publicId) return "skipped";
  if (!isOwned(publicId, owned)) {
    console.warn(`[media] refused to delete ${publicId}: outside the caller's slot (${owned})`);
    return "skipped";
  }
  return media.destroy(publicId, "image");
}

export async function deleteReplacedImage(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
  slot: OwnedSlot,
): Promise<DeleteOutcome | "skipped"> {
  if (!previousUrl || previousUrl === nextUrl) return "skipped";
  const media = resolveMediaDriver();
  const previousId = media.publicIdFromUrl(previousUrl);
  const nextId = nextUrl ? media.publicIdFromUrl(nextUrl) : null;
  if (previousId && previousId === nextId) return "skipped";
  return deleteImageByUrl(previousUrl, slot);
}

export { isCloudinaryConfigured, publicIdFromUrl, type DeleteOutcome };
