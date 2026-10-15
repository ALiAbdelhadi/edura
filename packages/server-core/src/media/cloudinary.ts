import { createHash } from "crypto";
import type {
  DeleteOutcome,
  MediaDeliveryType,
  MediaResourceType,
  MediaUploadOptions,
  StoredMedia,
} from "./storage/types";

export type CloudinaryResourceType = MediaResourceType;
export type CloudinaryDeliveryType = MediaDeliveryType;
export type UploadedAsset = StoredMedia;
export type UploadOptions = Omit<MediaUploadOptions, "fit"> & { transformation?: string };
export type { DeleteOutcome };

// SECURITY_AUDIT.md (2026-09-11) NET-03: a hung upstream must not pin a
// lambda to the platform maximum.
const OUTBOUND_TIMEOUT_MS = 15_000;

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

function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return sha1(`${toSign}${apiSecret}`);
}

export async function uploadBuffer(buffer: Buffer, options: UploadOptions): Promise<UploadedAsset> {
  const { cloud_name, api_key, api_secret } = getConfig();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = options.folder ?? "edura";
  const resource_type = options.resource_type ?? "raw";

  const params: Record<string, string | number> = { folder, timestamp };
  if (options.public_id) params.public_id = options.public_id;
  if (options.type) params.type = options.type;
  if (options.overwrite !== undefined) params.overwrite = options.overwrite ? "true" : "false";
  if (options.invalidate !== undefined) params.invalidate = options.invalidate ? "true" : "false";
  if (options.transformation) params.transformation = options.transformation;
  if (options.tags?.length) params.tags = options.tags.join(",");
  const signature = signParams(params, api_secret);

  const form = new FormData();
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
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS), // NET-03
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
 * A Cloudinary DELIVERY URL for an `authenticated` (or `private`) asset.
 *
 * SECURITY_AUDIT.md (2026-09-11) OPS-01. The previous body built
 * `s--<hex sha1 of API params>--/e_<ts>/` — that is the API-request signature
 * format, not the URL one, and `e_` is an effect, not an expiry — so the URL
 * it produced never validated; and it was never reached anyway, because the
 * public `secure_url` was persisted and returned first.
 *
 * Cloudinary's URL signature (cloudinary_npm `finalize_url`): the first 8
 * characters of URL-safe base64(sha1(`<transformation>/<public_id>` +
 * api_secret)), with no transformation here, and no version segment in the
 * signed string. Signed URLs do not expire on their own — revocation is
 * deleting or renaming the asset, which `deleteMaterial` already does.
 */
export function generateSignedUrl(
  publicId: string,
  opts: { resource_type?: CloudinaryResourceType; type?: CloudinaryDeliveryType } = {},
): string {
  const { cloud_name, api_secret } = getConfig();
  const resource_type = opts.resource_type ?? "raw";
  const type = opts.type ?? "authenticated";
  const signature = createHash("sha1")
    .update(`${publicId}${api_secret}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .slice(0, 8);
  return `https://res.cloudinary.com/${cloud_name}/${resource_type}/${type}/s--${signature}--/${publicId}`;
}

export async function deleteResource(
  publicId: string,
  resourceType: CloudinaryResourceType = "raw",
): Promise<DeleteOutcome> {
  try {
    const { cloud_name, api_key, api_secret } = getConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signParams({ invalidate: "true", public_id: publicId, timestamp }, api_secret);

    const form = new FormData();
    form.append("public_id", publicId);
    form.append("invalidate", "true");
    form.append("api_key", api_key);
    form.append("timestamp", String(timestamp));
    form.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/destroy`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS), // NET-03
    });
    if (!res.ok) {
      console.warn(
        `[cloudinary] destroy ${resourceType}/${publicId} failed: HTTP ${res.status} ${await res
          .text()
          .catch(() => "")}`.trim(),
      );
      return "failed";
    }
    const body = (await res.json().catch(() => null)) as { result?: string } | null;
    if (body?.result === "ok") return "deleted";
    if (body?.result === "not found") {
      console.warn(`[cloudinary] destroy ${resourceType}/${publicId}: not found (nothing deleted)`);
      return "not_found";
    }
    console.warn(
      `[cloudinary] destroy ${resourceType}/${publicId}: unexpected result ${JSON.stringify(body)}`,
    );
    return "failed";
  } catch (err) {
    console.warn(`[cloudinary] destroy ${resourceType}/${publicId} threw: ${String(err)}`);
    return "failed";
  }
}

export function publicIdFromUrl(url: string): string | null {
  const match = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/upload\/(.+)$/.exec(
    url,
  );
  if (!match) return null;
  const segments = (match[2] as string).split("/");
  while (segments.length > 1 && /^[a-z]{1,3}_[^/]*$/.test(segments[0] as string)) segments.shift();
  if (segments.length > 1 && /^v\d+$/.test(segments[0] as string)) segments.shift();
  const rest = segments.join("/");
  if (!rest) return null;
  return match[1] === "raw" ? rest : rest.replace(/\.[a-zA-Z0-9]+$/, "");
}
