import { createHash } from "crypto";
import { isMockMediaExplicit } from "./types";
import type { MediaStorageDriver, StoredMedia } from "./types";

const MOCK_ORIGIN = "https://mock-media.invalid";

const stored = new Set<string>();

function assertEnabled(): void {
  if (!isMockMediaExplicit()) {
    throw new Error("Media storage not configured");
  }
}

/**
 * Dev/test storage: no network, nothing persisted beyond the process. Uploads
 * work only when `MEDIA_MODE=mock` is set explicitly; the implicit fallback
 * (no Cloudinary env, no MEDIA_MODE) keeps uploads refused, as before the port.
 */
export const mockMediaDriver: MediaStorageDriver = {
  name: "mock",

  uploadsEnabled: isMockMediaExplicit,

  async upload(buffer, options): Promise<StoredMedia> {
    assertEnabled();
    const resource_type = options.resource_type ?? "raw";
    const type = options.type ?? "upload";
    const folder = options.folder ?? "edura";
    const id =
      options.public_id ?? createHash("sha1").update(buffer).digest("hex").slice(0, 20);
    const public_id = `${folder}/${id}`;
    stored.add(`${resource_type}:${public_id}`);
    return {
      public_id,
      secure_url: `${MOCK_ORIGIN}/${resource_type}/${type}/${public_id}`,
      bytes: buffer.length,
      format: null,
      width: null,
      height: null,
      version: null,
      resource_type,
    };
  },

  async destroy(publicId, resourceType = "raw") {
    return stored.delete(`${resourceType}:${publicId}`) ? "deleted" : "not_found";
  },

  signedUrl(publicId, opts = {}) {
    assertEnabled();
    return `${MOCK_ORIGIN}/${opts.resource_type ?? "raw"}/${opts.type ?? "authenticated"}/signed/${publicId}`;
  },

  publicIdFromUrl(url) {
    const match = /^https:\/\/mock-media\.invalid\/(?:image|raw|video)\/(?:upload|authenticated|private)\/(.+)$/.exec(
      url,
    );
    return match ? (match[1] as string) : null;
  },
};

export function __resetMockMediaForTests(): void {
  stored.clear();
}
