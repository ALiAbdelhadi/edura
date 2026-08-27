import { createHash } from "node:crypto";

export const RFC_UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

export const isRfcUuid = (value: string): boolean => RFC_UUID.test(value);

export const NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const hyphenate = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

export function uuidV5(name: string, namespace: string = NAMESPACE_DNS): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16) throw new Error(`uuidV5: namespace is not a UUID: ${namespace}`);

  const digest = createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50; // version 5
  digest[8] = (digest[8]! & 0x3f) | 0x80; // variant 10xx (RFC 4122/9562)

  return hyphenate(digest.subarray(0, 16).toString("hex"));
}

export function assertRfcUuid(id: string, context: string): string {
  if (!isRfcUuid(id)) {
    throw new Error(`seed-ids: generated a non-RFC-9562 id for ${context}: ${id}`);
  }
  return id;
}

export function seedId(prefix: string): (key: string) => string {
  return (key: string) => assertRfcUuid(uuidV5(prefix + key), `${prefix}${key}`);
}
