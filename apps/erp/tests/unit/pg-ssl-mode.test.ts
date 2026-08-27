import { describe, expect, it } from "vitest";
import { pinSslMode } from "@repo/database/pg-ssl";

const HOST = "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb";

describe("pinSslMode", () => {
  it.each(["require", "prefer", "verify-ca"])(
    "pins the aliased mode %s to verify-full",
    (mode) => {
      expect(pinSslMode(`${HOST}?sslmode=${mode}`)).toBe(
        `${HOST}?sslmode=verify-full`,
      );
    },
  );

  it("pins regardless of case", () => {
    expect(pinSslMode(`${HOST}?sslmode=REQUIRE`)).toBe(
      `${HOST}?sslmode=verify-full`,
    );
  });

  it("preserves the other query parameters and their order", () => {
    expect(pinSslMode(`${HOST}?sslmode=require&channel_binding=require`)).toBe(
      `${HOST}?sslmode=verify-full&channel_binding=require`,
    );
    expect(pinSslMode(`${HOST}?application_name=edura&sslmode=require`)).toBe(
      `${HOST}?application_name=edura&sslmode=verify-full`,
    );
  });

  it("only matches sslmode as a whole parameter", () => {
    const url = `${HOST}?xsslmode=require&sslmode_legacy=require`;
    expect(pinSslMode(url)).toBe(url);
  });

  it("ignores an upper-case sslmode KEY", () => {
    const url = `${HOST}?SSLMODE=require`;
    expect(pinSslMode(url)).toBe(url);
  });

  it("leaves a percent-encoded password byte-for-byte alone", () => {
    const encoded = "postgresql://edura_app:p%40ss%2Fword@host/neondb";
    expect(pinSslMode(`${encoded}?sslmode=require`)).toBe(
      `${encoded}?sslmode=verify-full`,
    );
    expect(pinSslMode(encoded)).toBe(encoded);
  });

  it("does not touch a `require` that is not the sslmode", () => {
    const url = `${HOST}?channel_binding=require`;
    expect(pinSslMode(url)).toBe(url);
  });

  it.each([
    ["disable", `${HOST}?sslmode=disable`], // what CI's local postgres uses
    ["no-verify", `${HOST}?sslmode=no-verify`],
    ["verify-full", `${HOST}?sslmode=verify-full`],
    ["absent", HOST],
  ])("leaves %s untouched", (_label, url) => {
    expect(pinSslMode(url)).toBe(url);
  });

  it.each(["true", "1", ""])(
    "respects an explicit libpq-compat opt-in (=%s)",
    (value) => {
      const url = `${HOST}?uselibpqcompat=${value}&sslmode=require`;
      expect(pinSslMode(url)).toBe(url);
    },
  );

  it.each([
    "host=localhost dbname=neondb sslmode=require",
    "",
    "not a connection string at all",
  ])("returns unparseable input verbatim: %s", (input) => {
    expect(pinSslMode(input)).toBe(input);
  });

  it("is idempotent", () => {
    const once = pinSslMode(`${HOST}?sslmode=require`);
    expect(pinSslMode(once)).toBe(once);
  });
});
