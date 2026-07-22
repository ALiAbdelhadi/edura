import { createHash } from "crypto";

/**
 * Cloudinary kernel — the ONE signed server-side client for both apps.
 *
 * Design notes:
 * - No SDK. Cloudinary's upload/destroy endpoints are plain signed multipart
 *   POSTs, so a ~150-line client avoids a dependency that would otherwise pull
 *   in Node-only transitives across two Next apps.
 * - Signing is SHA1(sorted `k=v&…` + api_secret), exactly per Cloudinary's spec.
 *   `api_key`, `file`, `resource_type` and `cloud_name` are NEVER signed.
 * - Delivery/transformation URLs are built CLIENT-side (@repo/ui/lib/cloudinary)
 *   because they need no secret; this module only does the privileged calls.
 *
 * The env vars (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET) are already set
 * for both apps. NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME mirrors the cloud name to
 * the browser — that value is public by construction (it appears in every
 * delivery URL), the key/secret never leave the server.
 */

export type CloudinaryResourceType = "image" | "raw" | "video";

export type UploadedAsset = {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string | null;
  width: number | null;
  height: number | null;
  version: number | null;
  resource_type: CloudinaryResourceType;
};

type CloudinaryConfig = { cloud_name: string; api_key: string; api_secret: string };

function getConfig(): CloudinaryConfig {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error("Cloudinary env vars not configured");
  }
  return { cloud_name, api_key, api_secret };
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

export function cloudName(): string | null {
  return process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? null;
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** SHA1 of the sorted, `&`-joined params + api_secret (Cloudinary's scheme). */
function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return sha1(`${toSign}${apiSecret}`);
}

export type UploadOptions = {
  folder?: string;
  /**
   * Deterministic id (WITHOUT the folder prefix) — pass it together with
   * `overwrite` so re-uploading an entity's image REPLACES the old asset in
   * place instead of accumulating orphans in the account.
   */
  public_id?: string;
  resource_type?: CloudinaryResourceType;
  filename?: string;
  contentType?: string;
  /** Replace an existing asset with the same public_id. */
  overwrite?: boolean;
  /** Purge the CDN edge caches for that public_id after an overwrite. */
  invalidate?: boolean;
  /** Server-side transformation applied BEFORE storage (e.g. cap dimensions). */
  transformation?: string;
  /** Free-form tags — handy for bulk cleanup of demo assets. */
  tags?: string[];
};

export async function uploadBuffer(buffer: Buffer, options: UploadOptions): Promise<UploadedAsset> {
  const { cloud_name, api_key, api_secret } = getConfig();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = options.folder ?? "edura";
  const resource_type = options.resource_type ?? "raw";

  // Only signed params go in here — api_key/file/resource_type are excluded.
  const params: Record<string, string | number> = { folder, timestamp };
  if (options.public_id) params.public_id = options.public_id;
  if (options.overwrite !== undefined) params.overwrite = options.overwrite ? "true" : "false";
  if (options.invalidate !== undefined) params.invalidate = options.invalidate ? "true" : "false";
  if (options.transformation) params.transformation = options.transformation;
  if (options.tags?.length) params.tags = options.tags.join(",");
  const signature = signParams(params, api_secret);

  const form = new FormData();
  // contentType defaults to PDF for the original materials caller; image
  // callers (avatars, logos, room photos) pass the detected image MIME +
  // resource_type "image".
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: options.contentType ?? "application/pdf" }),
    options.filename ?? "material.pdf",
  );
  form.append("api_key", api_key);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  for (const [key, value] of Object.entries(params)) {
    if (key === "timestamp") continue;
    form.append(key, String(value));
  }

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/${resource_type}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }
  const json = (await res.json()) as {
    public_id: string;
    secure_url: string;
    bytes: number;
    format?: string;
    width?: number;
    height?: number;
    version?: number;
  };
  return {
    public_id: json.public_id,
    secure_url: json.secure_url,
    bytes: json.bytes,
    format: json.format ?? null,
    width: json.width ?? null,
    height: json.height ?? null,
    version: json.version ?? null,
    resource_type,
  };
}

/**
 * Signed delivery URL for a PRIVATE/authenticated asset (used by materials).
 * Public images never need this — they are served straight from the CDN.
 */
export async function generateSignedUrl(publicId: string, expiresInSeconds = 3600): Promise<string> {
  const { cloud_name, api_secret } = getConfig();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = signParams({ expires_at: expiresAt, public_id: publicId }, api_secret);
  return `https://res.cloudinary.com/${cloud_name}/raw/upload/s--${signature}--/e_${expiresAt}/${publicId}`;
}

/**
 * Delete an asset. `resourceType` MUST match the type it was uploaded under —
 * destroying an image with resource_type "raw" silently no-ops (Cloudinary
 * returns `not found`), which is how orphan images accumulate. Defaults to
 * "raw" to preserve the original materials caller's behaviour.
 */
export async function deleteResource(
  publicId: string,
  resourceType: CloudinaryResourceType = "raw",
): Promise<void> {
  const { cloud_name, api_key, api_secret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ invalidate: "true", public_id: publicId, timestamp }, api_secret);

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("invalidate", "true");
  form.append("api_key", api_key);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/destroy`, {
    method: "POST",
    body: form,
  });
}

/**
 * Recover the public_id from a stored delivery URL.
 *
 * Rows written before this kernel existed (room photos, center logos pasted as
 * URLs) store only `secure_url`, so deletion and transformation both need this
 * to work backwards. Returns null for non-Cloudinary URLs — callers treat that
 * as "externally hosted, don't touch".
 */
export function publicIdFromUrl(url: string): string | null {
  const match = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/upload\/(.+)$/.exec(
    url,
  );
  if (!match) return null;
  const segments = (match[2] as string).split("/");
  // Drop any leading transformation segments and the version segment.
  while (segments.length > 1 && /^[a-z]{1,3}_[^/]*$/.test(segments[0] as string)) segments.shift();
  if (segments.length > 1 && /^v\d+$/.test(segments[0] as string)) segments.shift();
  const rest = segments.join("/");
  if (!rest) return null;
  // Images/videos carry a format extension that is NOT part of the public_id;
  // raw assets keep theirs.
  return match[1] === "raw" ? rest : rest.replace(/\.[a-zA-Z0-9]+$/, "");
}
