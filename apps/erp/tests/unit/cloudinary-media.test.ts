import { describe, it, expect } from "vitest";

import { publicIdFromUrl } from "@repo/server-core/media/cloudinary";
import {
  ACCEPTED_IMAGE_MIMES,
  detectImageType,
  extensionFor,
  MAX_IMAGE_BYTES,
  PLATFORM_BODY_LIMIT_BYTES,
} from "@repo/server-core/media/images";
import {
  ACCEPTED_IMAGE_MIMES as UI_ACCEPTED_IMAGE_MIMES,
  UI_MAX_IMAGE_BYTES,
} from "@repo/ui/components/image-upload-field";
import arShared from "@/messages/ar/shared.json";
import enShared from "@/messages/en/shared.json";
import {
  buildTransform,
  cldSrcSet,
  cldUrl,
  cloudinaryLoader,
  isCloudinaryUrl,
  CLD_PRESETS,
} from "@repo/ui/lib/cloudinary";

const BASE = "https://res.cloudinary.com/edura-demo/image/upload/v1712345678/edura/logos/abc.png";

describe("delivery URLs (@repo/ui/lib/cloudinary)", () => {
  it("always requests f_auto + q_auto — the default that makes images cheap", () => {
    expect(buildTransform()).toBe("f_auto,q_auto");
  });

  it("injects the transformation right after /upload/ and keeps the version", () => {
    const url = cldUrl(BASE, { width: 96, height: 96, crop: "fill", gravity: "face" });
    expect(url).toBe(
      "https://res.cloudinary.com/edura-demo/image/upload/f_auto,q_auto,c_fill,g_face,w_96,h_96/v1712345678/edura/logos/abc.png",
    );
  });

  it("leaves non-Cloudinary sources untouched", () => {
    expect(cldUrl("https://example.com/a.png", { width: 96 })).toBe("https://example.com/a.png");
    expect(cldUrl("data:image/png;base64,AAAA", { width: 96 })).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(cldUrl(null)).toBeNull();
    expect(isCloudinaryUrl("https://example.com/a.png")).toBe(false);
  });

  it("builds a responsive srcSet with one candidate per width", () => {
    const srcSet = cldSrcSet(BASE, [320, 640]);
    expect(srcSet).toContain("w_320");
    expect(srcSet).toContain(" 320w");
    expect(srcSet).toContain("w_640");
    expect(srcSet).toContain(" 640w");
  });

  it("presets encode the intent: avatars crop to a face, logos are never cropped", () => {
    expect(buildTransform(CLD_PRESETS.avatar(64))).toContain("c_fill,g_face");
    expect(buildTransform(CLD_PRESETS.logo(64))).toContain("c_fit");
    expect(buildTransform(CLD_PRESETS.logo(64))).not.toContain("c_fill");
  });

  it("the next/image loader resizes without upscaling", () => {
    expect(cloudinaryLoader({ src: BASE, width: 400 })).toContain("c_limit,w_400");
  });
});

describe("publicIdFromUrl", () => {
  it("recovers the id from a plain delivery URL (dropping version + extension)", () => {
    expect(publicIdFromUrl(BASE)).toBe("edura/logos/abc");
  });

  it("recovers the id even when the URL already carries transformations", () => {
    const transformed = cldUrl(BASE, { width: 96 }) as string;
    expect(publicIdFromUrl(transformed)).toBe("edura/logos/abc");
  });

  it("keeps the extension for raw assets (materials keep theirs)", () => {
    expect(
      publicIdFromUrl("https://res.cloudinary.com/edura-demo/raw/upload/v1/edura/m/f.pdf"),
    ).toBe("edura/m/f.pdf");
  });

  it("returns null for foreign URLs so we never try to delete someone else's asset", () => {
    expect(publicIdFromUrl("https://example.com/a.png")).toBeNull();
  });
});

describe("magic-byte detection (M6 parity for images)", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "ascii"),
    Buffer.alloc(8),
  ]);

  it("identifies real images by their bytes", () => {
    expect(detectImageType(jpeg)).toBe("image/jpeg");
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(webp)).toBe("image/webp");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });

  it("rejects a script payload no matter what the client claims it is", () => {
    const svgBomb = Buffer.from('<svg onload="alert(1)"></svg>       ', "ascii");
    const html = Buffer.from("<!DOCTYPE html><script>x()</script>", "ascii");
    expect(detectImageType(svgBomb)).toBeNull();
    expect(detectImageType(html)).toBeNull();
  });
});

describe("the size ceiling is bounded by the platform, not by taste", () => {
  it("accepts no image the deployment's request-body cap would kill at the edge", () => {
    expect(MAX_IMAGE_BYTES).toBeLessThan(PLATFORM_BODY_LIMIT_BYTES);
    expect(PLATFORM_BODY_LIMIT_BYTES - MAX_IMAGE_BYTES).toBeGreaterThanOrEqual(256 * 1024);
  });

  it("the browser control refuses at exactly the size the server refuses at", () => {
    expect(UI_MAX_IMAGE_BYTES).toBe(MAX_IMAGE_BYTES);
  });

  it("the size stated to the user is the size enforced", () => {
    const stated = [arShared.imageDropHint, enShared.imageDropHint];
    for (const hint of stated) {
      const mb = Number(/(\d+(?:\.\d+)?)\s*(?:MB|ميجابايت)/.exec(hint)?.[1]);
      expect(mb, `no size found in: ${hint}`).not.toBeNaN();
      expect(mb * 1024 * 1024).toBe(MAX_IMAGE_BYTES);
    }
  });
});

describe("the file picker offers exactly what the sniffer admits", () => {
  it("the browser accept= list equals the server's accepted set", () => {
    expect([...UI_ACCEPTED_IMAGE_MIMES].sort()).toEqual([...ACCEPTED_IMAGE_MIMES].sort());
  });

  it("every advertised type really is sniffable — the list cannot outrun the sniffer", () => {
    for (const mime of ACCEPTED_IMAGE_MIMES) {
      expect(extensionFor(mime), `no extension mapped for ${mime}`).toBeTruthy();
    }
    expect(ACCEPTED_IMAGE_MIMES).toContain("image/gif");
  });
});
