import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as cld from "@repo/ui/lib/cloudinary";
import {
  MEDIA_DELIVERY_HOSTS,
  MEDIA_PRESETS,
  isMediaDeliveryUrl,
  isPlatformMediaUrl,
  mediaLoader,
  mediaPlaceholder,
  mediaSrcSet,
  mediaUrl,
} from "@repo/ui/lib/media";
import { MEDIA_IMG_SRC, mediaImageRemotePatterns } from "@repo/shared/media-delivery";
import * as erpCsp from "@/lib/security/csp";
import * as saCsp from "../../../superadmin/src/lib/security/csp";

const BASE = "https://res.cloudinary.com/edura-demo/image/upload/v1712345678/edura/logos/abc.png";
const D = "https://res.cloudinary.com/edura-demo";

describe("client media adapter — URLs byte-identical to the Cloudinary builder", () => {
  const saved = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "edura-demo";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    else process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = saved;
  });

  it.each([
    ["avatar", MEDIA_PRESETS.avatar(32), `${D}/image/upload/f_auto,q_auto,c_fill,g_face,w_32,h_32,dpr_2/v1712345678/edura/logos/abc.png`],
    ["logo", MEDIA_PRESETS.logo(64), `${D}/image/upload/f_auto,q_auto,c_fit,w_64,h_64,dpr_2/v1712345678/edura/logos/abc.png`],
    ["cover", MEDIA_PRESETS.cover(800, 450), `${D}/image/upload/f_auto,q_auto,c_fill,g_auto,w_800,h_450/v1712345678/edura/logos/abc.png`],
    ["thumb", MEDIA_PRESETS.thumb(120, 90), `${D}/image/upload/f_auto,q_auto,c_fill,g_auto,w_120,h_90/v1712345678/edura/logos/abc.png`],
    ["CldImage default", { width: 96, height: 96, crop: "fill", gravity: "auto" } as const, `${D}/image/upload/f_auto,q_auto,c_fill,g_auto,w_96,h_96/v1712345678/edura/logos/abc.png`],
  ])("%s on a stored secure_url", (_name, opts, expected) => {
    expect(mediaUrl(BASE, opts)).toBe(expected);
    expect(cld.cldUrl(BASE, opts)).toBe(expected);
  });

  it("public_id and video shapes", () => {
    expect(mediaUrl("/edura/logos/abc", MEDIA_PRESETS.avatar(32))).toBe(
      `${D}/image/upload/f_auto,q_auto,c_fill,g_face,w_32,h_32,dpr_2/edura/logos/abc`,
    );
    expect(mediaUrl("edura/v", {}, "video")).toBe(`${D}/video/upload/f_auto,q_auto/edura/v`);
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    expect(mediaUrl("edura/v")).toBe("edura/v");
  });

  it("passes foreign, data, blob and empty sources through untouched", () => {
    for (const s of ["https://example.com/a.png", "//cdn.x/a.png", "data:image/png;base64,AA", "blob:http://x/1"]) {
      expect(mediaUrl(s, { width: 96 })).toBe(s);
      expect(mediaSrcSet(s, [320])).toBeUndefined();
      expect(mediaPlaceholder(s)).toBeNull();
    }
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl("")).toBeNull();
  });

  it("srcset, placeholder and loader", () => {
    expect(mediaSrcSet(BASE, [320, 640], { width: 800, height: 450, crop: "fill", gravity: "auto" })).toBe(
      `${D}/image/upload/f_auto,q_auto,c_fill,g_auto,w_320,h_180/v1712345678/edura/logos/abc.png 320w, ` +
        `${D}/image/upload/f_auto,q_auto,c_fill,g_auto,w_640,h_360/v1712345678/edura/logos/abc.png 640w`,
    );
    expect(mediaPlaceholder(BASE)).toBe(`${D}/image/upload/f_auto,q_auto:low,c_fill,w_24,e_blur:400/v1712345678/edura/logos/abc.png`);
    expect(mediaLoader({ src: BASE, width: 400 })).toBe(`${D}/image/upload/f_auto,q_auto,c_limit,w_400/v1712345678/edura/logos/abc.png`);
    expect(mediaLoader({ src: BASE, width: 400, quality: 75 })).toBe(`${D}/image/upload/f_auto,q_75,c_limit,w_400/v1712345678/edura/logos/abc.png`);
  });

  it("the delivery-URL sniff keeps its loose match", () => {
    expect(isMediaDeliveryUrl(BASE)).toBe(true);
    expect(isMediaDeliveryUrl("http://res.cloudinary.com/c/image/upload/a.png")).toBe(true);
    expect(isMediaDeliveryUrl("https://example.com/a.png")).toBe(false);
    expect(isMediaDeliveryUrl(null)).toBe(false);
  });
});

describe("platform media host check (admin-api logoUrl / photoUrl)", () => {
  const legacy = (u: string) => u.startsWith("https://res.cloudinary.com/");
  it.each([
    [BASE, true],
    ["https://res.cloudinary.com/x", true],
    ["http://res.cloudinary.com/edura-demo/image/upload/a.png", false],
    ["https://res.cloudinary.com.evil.com/edura-demo/a.png", false],
    ["https://res.cloudinary.com", false],
    ["https://evil.com/https://res.cloudinary.com/a.png", false],
    ["https://RES.cloudinary.com/a.png", false],
    ["https://sub.res.cloudinary.com/a.png", false],
    ["//res.cloudinary.com/a.png", false],
    ["https://res.cloudinary.com@evil.com/a.png", false],
  ])("%s -> %s", (url, ok) => {
    expect(isPlatformMediaUrl(url)).toBe(ok);
    expect(isPlatformMediaUrl(url)).toBe(legacy(url));
  });
});

describe("CSP and next/image allow-lists unchanged", () => {
  it("names exactly the one delivery host", () => {
    expect(MEDIA_DELIVERY_HOSTS).toEqual(["res.cloudinary.com"]);
    expect(MEDIA_IMG_SRC).toBe("https://res.cloudinary.com");
  });

  it("page CSPs are byte-identical", () => {
    expect(erpCsp.buildPageCsp({ nonce: "n", isDev: true, realtimeHttp: "https://rt.example" })).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval'; connect-src 'self' https://rt.example wss://rt.example https://*.ingest.sentry.io https://*.ingest.de.sentry.io; frame-src 'self' https://accept.paymob.com; worker-src 'self'; manifest-src 'self'; report-uri /api/v1/security/csp-report; report-to csp-endpoint",
    );
    expect(saCsp.buildPageCsp({ nonce: "n", isDev: false, erpFormAction: "https://erp.example" })).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://erp.example; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-n' 'strict-dynamic'; connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io; frame-src 'none'; worker-src 'self'; report-uri /api/v1/security/csp-report; report-to csp-endpoint",
    );
  });

  it("next/image remotePatterns are unchanged, failing closed when the cloud name is unset", () => {
    expect(mediaImageRemotePatterns("edura-demo")).toEqual([
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/edura-demo/**" },
    ]);
    expect(mediaImageRemotePatterns(undefined)).toEqual([
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/cloud-name-unset/**" },
    ]);
    expect(mediaImageRemotePatterns("")).toEqual([
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/cloud-name-unset/**" },
    ]);
  });
});
