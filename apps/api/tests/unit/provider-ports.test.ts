import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMediaDriver } from "@repo/server-core/media/storage/index";
import { cloudinaryTransformation } from "@repo/server-core/media/storage/cloudinary-driver";
import { resolveFcmDriver, resolveWebPushDriver } from "@repo/server-core/services/push/index";
import { resolveSmsDriver } from "@repo/server-core/services/sms/index";
import {
  createMemoryStore,
  keyValueMode,
  resolveKeyValueStore,
} from "@repo/server-core/kv/index";
import { resolveMailDriver } from "@repo/notifications/transport/index";

afterEach(() => vi.unstubAllEnvs());

const CLOUDINARY = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

describe("media storage port", () => {
  it("falls back to the mock driver, uploads refused, when Cloudinary is not configured", async () => {
    for (const k of CLOUDINARY) vi.stubEnv(k, "");
    vi.stubEnv("MEDIA_MODE", "");
    const driver = resolveMediaDriver();
    expect(driver.name).toBe("mock");
    expect(driver.uploadsEnabled()).toBe(false);
    await expect(driver.upload(Buffer.from("x"), {})).rejects.toThrow(/not configured/);
  });

  it("picks Cloudinary when its env is set", () => {
    for (const k of CLOUDINARY) vi.stubEnv(k, "v");
    vi.stubEnv("MEDIA_MODE", "");
    const driver = resolveMediaDriver();
    expect(driver.name).toBe("cloudinary");
    expect(driver.uploadsEnabled()).toBe(true);
  });

  it("MEDIA_MODE=mock uploads without network and keeps the caller's public_id", async () => {
    for (const k of CLOUDINARY) vi.stubEnv(k, "v");
    vi.stubEnv("MEDIA_MODE", "mock");
    const driver = resolveMediaDriver();
    expect(driver.name).toBe("mock");
    const asset = await driver.upload(Buffer.from("img"), {
      folder: "edura/avatars",
      public_id: "user-1",
      resource_type: "image",
    });
    expect(asset.public_id).toBe("edura/avatars/user-1");
    expect(driver.publicIdFromUrl(asset.secure_url)).toBe("edura/avatars/user-1");
    expect(await driver.destroy(asset.public_id, "image")).toBe("deleted");
    expect(await driver.destroy(asset.public_id, "image")).toBe("not_found");
  });

  it("translates the neutral fit option to the exact Cloudinary transformation strings", () => {
    expect(cloudinaryTransformation({ maxWidth: 1024, maxHeight: 1024, quality: "good" })).toBe(
      "c_limit,w_1024,h_1024,q_auto:good",
    );
    expect(cloudinaryTransformation({ maxWidth: 2048, maxHeight: 1152, quality: "good" })).toBe(
      "c_limit,w_2048,h_1152,q_auto:good",
    );
    expect(cloudinaryTransformation({ maxWidth: 2048, maxHeight: 2048, quality: "good" })).toBe(
      "c_limit,w_2048,h_2048,q_auto:good",
    );
  });

  it("mock driver ignores fit", async () => {
    vi.stubEnv("MEDIA_MODE", "mock");
    const asset = await resolveMediaDriver().upload(Buffer.from("i"), {
      fit: { maxWidth: 10, maxHeight: 10, quality: "good" },
    });
    expect(asset.public_id).toMatch(/^edura\//);
  });

  it("refuses MEDIA_MODE=mock in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MEDIA_MODE", "mock");
    expect(() => resolveMediaDriver()).toThrow(/not allowed in production/);
  });
});

describe("push port", () => {
  it("chooses the mock drivers when no VAPID / Firebase config is present", async () => {
    vi.stubEnv("PUSH_MODE", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveWebPushDriver().name).toBe("mock");
    const fcm = resolveFcmDriver();
    expect(fcm.name).toBe("mock");
    expect(await fcm.deliver(["t"], { title: "a", body: "b" })).toEqual([]);
  });

  it("PUSH_MODE=mock forces the mock even with credentials", () => {
    vi.stubEnv("PUSH_MODE", "mock");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "{}");
    expect(resolveFcmDriver().name).toBe("mock");
  });

  it("uses FCM when its credentials are set", () => {
    vi.stubEnv("PUSH_MODE", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "{}");
    expect(resolveFcmDriver().name).toBe("fcm");
  });
});

describe("key-value port", () => {
  it("uses the memory store when REDIS_URL is absent", async () => {
    vi.stubEnv("REDIS_URL", "");
    expect(keyValueMode()).toBe("memory");
    const opened = await resolveKeyValueStore({
      url: process.env.REDIS_URL,
      onError: () => {},
      onInitError: () => {},
    });
    expect(opened).toBeNull();
  });

  it("memory store keeps get/set TTL, incr and token-bucket semantics", async () => {
    const store = createMemoryStore();
    await store.set("k", "v", 1000);
    expect(await store.get("k")).toBe("v");
    expect(await store.incr("n")).toBe(1);
    expect(await store.incr("n")).toBe(2);
    const bucket = { capacity: 1, refillPerMs: 0, now: Date.now(), ttlMs: 0 };
    expect(await store.takeToken("b", bucket)).toBe(true);
    expect(await store.takeToken("b", bucket)).toBe(false);
  });
});

describe("mail port", () => {
  it("chooses the console driver when MAIL_PROVIDER is unset", () => {
    vi.stubEnv("MAIL_PROVIDER", "");
    const driver = resolveMailDriver();
    expect(driver.name).toBe("console");
    expect(driver.isConfigured()).toBe(false);
  });

  it("chooses SMTP when MAIL_PROVIDER=smtp", () => {
    vi.stubEnv("MAIL_PROVIDER", "smtp");
    expect(resolveMailDriver().name).toBe("smtp");
  });
});

describe("sms port", () => {
  it("chooses the console driver when SMS_PROVIDER is unset", async () => {
    vi.stubEnv("SMS_PROVIDER", "");
    delete process.env.SMS_PROVIDER;
    expect(resolveSmsDriver().name).toBe("console");
  });
});
