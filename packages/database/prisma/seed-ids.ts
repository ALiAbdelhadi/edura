/**
 * ============================================================================
 * DETERMINISTIC IDS FOR THE DEMO / PREVIEW SEEDS  (H-03)
 * ============================================================================
 * The seeds mint their own primary keys so a re-run upserts instead of
 * duplicating. Both of them used to build that id by slicing a raw SHA-1 digest
 * into the 8-4-4-4-12 shape:
 *
 *     const h = createHash("sha1").update(ns + key).digest("hex");
 *     `${h.slice(0,8)}-${h.slice(8,12)}-…`          // <- NOT a UUID
 *
 * That is UUID-*shaped* but not a UUID. RFC 9562 reserves the first nibble of
 * group 3 for the version (1-8) and the first nibble of group 4 for the variant
 * (8 | 9 | a | b); a raw digest leaves both random, so only ~1 id in 8 was
 * valid. `z.uuid()` (zod 4 validates RFC 9562) therefore rejected most seeded
 * ids, and every route with a `z.uuid()` body field answered 400 on demo data —
 * counter check-in, walk-in cash, checkout and starting a conversation all
 * failed on the very fixtures they were seeded for.
 *
 * The ids were the defect, not the validation. `seedId()` below produces a
 * genuine **UUIDv5** (RFC 9562 §5.5 — name-based, SHA-1) under the standard DNS
 * namespace, so it is:
 *   • still deterministic  -> the seeds stay idempotent upsert-by-id,
 *   • still namespaced     -> two seeds cannot collide on the same key,
 *   • reproducible by any off-the-shelf uuid library (uuid.v5(name, uuid.v5.DNS)),
 *   • and RFC-valid, so the routes accept it with no change to their guards.
 *
 * ONE implementation, imported by every seed. A seed that hand-rolls its own
 * formatter is what caused this, so there is deliberately nothing to copy —
 * and `assertRfcUuid` makes the generator itself fail loudly rather than let a
 * malformed id reach the database again.
 * ============================================================================
 */
import { createHash } from "node:crypto";

/**
 * Verbatim copy of zod 4's `regexes.uuid()` with no version pinned — the exact
 * predicate every `z.uuid()` route field applies. Kept here so the seed side
 * and the route side are provably testing the same thing (a unit test asserts
 * this string still matches zod's).
 */
export const RFC_UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

export const isRfcUuid = (value: string): boolean => RFC_UUID.test(value);

/** RFC 9562 §6.6 — the standard DNS namespace. */
export const NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const hyphenate = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

/**
 * RFC 9562 §5.5 name-based UUID (SHA-1). The two stamped bytes are what the old
 * helper omitted: byte 6 carries the version, byte 8 the variant.
 */
export function uuidV5(name: string, namespace: string = NAMESPACE_DNS): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16) throw new Error(`uuidV5: namespace is not a UUID: ${namespace}`);

  const digest = createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50; // version 5
  digest[8] = (digest[8]! & 0x3f) | 0x80; // variant 10xx (RFC 4122/9562)

  return hyphenate(digest.subarray(0, 16).toString("hex"));
}

/**
 * Throws if `id` is not something a `z.uuid()` route field would accept. The
 * generator below calls this on every id it returns, so a seed can no longer
 * write an id the API will reject — the failure surfaces at seed time with the
 * offending key, not later as an unexplained 400 in the preview.
 */
export function assertRfcUuid(id: string, context: string): string {
  if (!isRfcUuid(id)) {
    throw new Error(`seed-ids: generated a non-RFC-9562 id for ${context}: ${id}`);
  }
  return id;
}

/**
 * Build a seed's deterministic-id function. `prefix` is that seed's private
 * namespace (keep it stable — changing it changes every id that seed owns).
 *
 *     const did = seedId("edura-preview:");
 *     did("room:NILE")   // -> a stable, RFC-valid UUIDv5
 */
export function seedId(prefix: string): (key: string) => string {
  return (key: string) => assertRfcUuid(uuidV5(prefix + key), `${prefix}${key}`);
}
