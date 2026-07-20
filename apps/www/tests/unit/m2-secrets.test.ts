import { afterEach, describe, expect, it, vi } from "vitest";
import { requireDedicatedSecret } from "@/lib/config/secrets";

// M2 — dedicated per-boundary secrets: required in prod (fail closed), dev-only
// fallback to NEXTAUTH_SECRET.

afterEach(() => vi.unstubAllEnvs());

describe("M2 — requireDedicatedSecret", () => {
  it("PROD + REALTIME_JWT_SECRET unset -> throws (no NEXTAUTH_SECRET reuse)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_JWT_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "the-shared-secret");
    expect(() => requireDedicatedSecret("REALTIME_JWT_SECRET")).toThrow(
      /required in production/,
    );
  });

  it("PROD + INTERNAL_API_SECRET unset -> throws", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "the-shared-secret");
    expect(() => requireDedicatedSecret("INTERNAL_API_SECRET")).toThrow(
      /required in production/,
    );
  });

  it("PROD + dedicated set -> returns the dedicated secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_JWT_SECRET", "dedicated-realtime");
    vi.stubEnv("NEXTAUTH_SECRET", "the-shared-secret");
    expect(requireDedicatedSecret("REALTIME_JWT_SECRET")).toBe("dedicated-realtime");
  });

  it("DEV + only NEXTAUTH_SECRET -> falls back (no local-dev regression)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REALTIME_JWT_SECRET", "");
    vi.stubEnv("INTERNAL_API_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "the-shared-secret");
    expect(requireDedicatedSecret("REALTIME_JWT_SECRET")).toBe("the-shared-secret");
    expect(requireDedicatedSecret("INTERNAL_API_SECRET")).toBe("the-shared-secret");
  });

  it("DEV + dedicated set -> prefers the dedicated secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REALTIME_JWT_SECRET", "dev-dedicated");
    vi.stubEnv("NEXTAUTH_SECRET", "the-shared-secret");
    expect(requireDedicatedSecret("REALTIME_JWT_SECRET")).toBe("dev-dedicated");
  });
});
