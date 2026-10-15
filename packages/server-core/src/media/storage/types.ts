export type MediaMode = "cloudinary" | "mock";

export type MediaResourceType = "image" | "raw" | "video";

/**
 * `upload` is served to anyone who holds the URL; `authenticated` only through
 * a URL carrying a valid signature (see `signedUrl`). Paid material lives behind
 * `authenticated` — SECURITY_AUDIT.md (2026-09-11) OPS-01.
 */
export type MediaDeliveryType = "upload" | "authenticated" | "private";

export type MediaImageFit = {
  maxWidth: number;
  maxHeight: number;
  quality?: "good";
};

export type MediaUploadOptions = {
  folder?: string;
  public_id?: string;
  resource_type?: MediaResourceType;
  type?: MediaDeliveryType;
  filename?: string;
  contentType?: string;
  overwrite?: boolean;
  invalidate?: boolean;
  fit?: MediaImageFit;
  tags?: string[];
};

export type StoredMedia = {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string | null;
  width: number | null;
  height: number | null;
  version: number | null;
  resource_type: MediaResourceType;
};

export type DeleteOutcome = "deleted" | "not_found" | "failed";

export interface MediaStorageDriver {
  readonly name: MediaMode;

  uploadsEnabled(): boolean;

  upload(buffer: Buffer, options: MediaUploadOptions): Promise<StoredMedia>;

  destroy(publicId: string, resourceType?: MediaResourceType): Promise<DeleteOutcome>;

  signedUrl(
    publicId: string,
    opts?: { resource_type?: MediaResourceType; type?: MediaDeliveryType },
  ): string;

  publicIdFromUrl(url: string): string | null;
}

function explicitMediaMode(): MediaMode | null {
  const raw = process.env.MEDIA_MODE?.trim().toLowerCase();
  return raw === "cloudinary" || raw === "mock" ? raw : null;
}

export function isMockMediaExplicit(): boolean {
  return explicitMediaMode() === "mock";
}

export function mediaMode(cloudinaryConfigured: boolean): MediaMode {
  return explicitMediaMode() ?? (cloudinaryConfigured ? "cloudinary" : "mock");
}
