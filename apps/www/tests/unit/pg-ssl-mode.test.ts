// Proof for `pinSslMode` — the guard that keeps `pg` from silently downgrading
// our TLS guarantee at the next major.
//
// `pg` 8.22 treats `sslmode=require` (what Neon's console hands out, and what
// every environment here is configured with) as `verify-full`, and warns that
// pg v9 will give it the weaker libpq meaning instead. The pin rewrites those
// aliases to the mode they mean TODAY, so the bump changes nothing.
//
// What matters here is the pair of directions: it must rewrite the three
// aliased modes, and it must leave everything else — including the explicit
// libpq-compat opt-in and CI's `sslmode=disable` — exactly as written.
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
    // …and when sslmode is not the first parameter.
    expect(pinSslMode(`${HOST}?application_name=edura&sslmode=require`)).toBe(
      `${HOST}?application_name=edura&sslmode=verify-full`,
    );
  });

  // `sslmode` must match as a WHOLE parameter name. `xsslmode` and
  // `sslmode_legacy` merely contain it and decide nothing.
  it("only matches sslmode as a whole parameter", () => {
    const url = `${HOST}?xsslmode=require&sslmode_legacy=require`;
    expect(pinSslMode(url)).toBe(url);
  });

  // pg reads `config.sslmode` case-sensitively, so an upper-case KEY is not
  // the key that decides anything and must not be rewritten as though it were.
  it("ignores an upper-case sslmode KEY", () => {
    const url = `${HOST}?SSLMODE=require`;
    expect(pinSslMode(url)).toBe(url);
  });

  // The case a naive parse-and-reserialize mangles: re-encoding would hand the
  // driver a different secret than the one in the env file.
  it("leaves a percent-encoded password byte-for-byte alone", () => {
    const encoded = "postgresql://edura_app:p%40ss%2Fword@host/neondb";
    expect(pinSslMode(`${encoded}?sslmode=require`)).toBe(
      `${encoded}?sslmode=verify-full`,
    );
    expect(pinSslMode(encoded)).toBe(encoded);
  });

  // `channel_binding=require` is a Neon parameter that happens to share the
  // word. Only `sslmode` may be touched.
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

  // Setting `uselibpqcompat` IS the deliberate opt-in to the weaker semantics.
  // Overriding it would take a decision away from its author. Keyed on the
  // KEY's presence, not its value — `=1` is the same choice as `=true`, and an
  // earlier version of this module that matched only `"true"` would have
  // silently reversed it.
  it.each(["true", "1", ""])(
    "respects an explicit libpq-compat opt-in (=%s)",
    (value) => {
      const url = `${HOST}?uselibpqcompat=${value}&sslmode=require`;
      expect(pinSslMode(url)).toBe(url);
    },
  );

  // A libpq keyword/value string is not a URL. It must come back verbatim so
  // the driver — not this helper — reports whatever is wrong with it.
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
