// Cloudinary v2 helper — wraps the SDK with lazy init and signed URL generation.
// Required env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
import { createHash } from "crypto";

function getConfig() {
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

export async function uploadBuffer(
  buffer: Buffer,
  options: { folder?: string; public_id?: string; resource_type?: string; filename?: string },
): Promise<{ public_id: string; secure_url: string; bytes: number }> {
  const { cloud_name, api_key, api_secret } = getConfig();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = options.folder ?? "edura";
  const params: Record<string, string | number> = { folder, timestamp };
  if (options.public_id) params.public_id = options.public_id;
  const signature = signParams(params, api_secret);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), options.filename ?? "material.pdf");
  form.append("api_key", api_key);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);
  if (options.public_id) form.append("public_id", options.public_id);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/${options.resource_type ?? "raw"}/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }
  const json = (await res.json()) as { public_id: string; secure_url: string; bytes: number };
  return { public_id: json.public_id, secure_url: json.secure_url, bytes: json.bytes };
}

export async function generateSignedUrl(publicId: string, expiresInSeconds = 3600): Promise<string> {
  const { cloud_name, api_secret } = getConfig();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = signParams({ expires_at: expiresAt, public_id: publicId }, api_secret);
  return `https://res.cloudinary.com/${cloud_name}/raw/upload/s--${signature}--/e_${expiresAt}/${publicId}`;
}

export async function deleteResource(publicId: string): Promise<void> {
  const { cloud_name, api_key, api_secret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp }, api_secret);

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", api_key);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/raw/destroy`, {
    method: "POST",
    body: form,
  });
}
