import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSignedUrl } from "@repo/server-core/media/cloudinary";

// OPS-01 (SECURITY_AUDIT.md 2026-09-11): the material download URL must be a
// real Cloudinary URL signature for an `authenticated` asset — first 8 chars
// of URL-safe base64(sha1(public_id + api_secret)) — not the API-parameter
// signature the old body produced. This pins the algorithm; a live check
// against a Cloudinary account is in SECURITY_TODO.md.
const ENV = { ...process.env };

describe("generateSignedUrl (Cloudinary authenticated delivery)", () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "testcloud";
    process.env.CLOUDINARY_API_KEY = "123456789";
    process.env.CLOUDINARY_API_SECRET = "s3cr3t-for-tests";
  });
  afterEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = ENV.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_API_KEY = ENV.CLOUDINARY_API_KEY;
    process.env.CLOUDINARY_API_SECRET = ENV.CLOUDINARY_API_SECRET;
  });

  it("builds an /raw/authenticated/ URL carrying an 8-char URL-safe signature", () => {
    const publicId = "edura/materials/course-1/abc123.pdf";
    const url = generateSignedUrl(publicId);
    const expected = createHash("sha1")
      .update(`${publicId}s3cr3t-for-tests`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .slice(0, 8);
    expect(url).toBe(
      `https://res.cloudinary.com/testcloud/raw/authenticated/s--${expected}--/${publicId}`,
    );
    expect(url).toMatch(/\/s--[A-Za-z0-9_-]{8}--\//);
    expect(url).not.toMatch(/\/e_\d+\//); // the old fictional "expiry" segment
  });

  it("changes with the secret and with the public id", () => {
    const a = generateSignedUrl("x/y.pdf");
    process.env.CLOUDINARY_API_SECRET = "another";
    const b = generateSignedUrl("x/y.pdf");
    const c = generateSignedUrl("x/z.pdf");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });
});
