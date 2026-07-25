/**
 * H-03 STRUCTURAL PROOF — the demo seeds can only mint ids that the routes'
 * `z.uuid()` accepts, and the routes' validation was NOT weakened to get there.
 *
 * The defect: both demo seeds built their deterministic ids by slicing a raw
 * SHA-1 digest into the 8-4-4-4-12 shape. That is UUID-*shaped* but not a UUID —
 * RFC 9562 fixes the first nibble of group 3 (version, 1-8) and of group 4
 * (variant, 8|9|a|b), and a raw digest leaves both random, so only ~1 id in 8
 * happened to be valid. zod 4 validates RFC 9562, so most seeded ids were
 * rejected with 400 and the preview could not demonstrate counter check-in,
 * walk-in cash, checkout or messaging on its own fixtures.
 *
 * The fix is on the DATA side: one shared generator emitting genuine UUIDv5.
 * This file asserts both halves of "fix the data, not the guard":
 *   P1  the generator is a real RFC 9562 §5.5 UUIDv5 (known-answer vector)
 *   P2  every id it can produce passes the SAME predicate zod applies
 *   P3  the OLD formula fails that predicate — i.e. this test would have caught it
 *   P4  ids stay deterministic and namespace-separated (seeds stay idempotent)
 *   P5  no seed hand-rolls its own hash->uuid formatter any more (drift guard)
 *   P6  the affected routes still validate those fields as UUIDs — nothing relaxed
 *
 * The behavioural half (the four flows over real HTTP against the seeded demo
 * data) is tests/db/h03-seed-uuid-flows.test.ts.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  seedId,
  uuidV5,
  isRfcUuid,
  RFC_UUID,
  NAMESPACE_DNS,
} from "@repo/database/seed-ids";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const PREVIEW_SEED = read("../../../../packages/database/prisma/preview-seed.ts");
const MESSAGING_SEED = read("../../../../packages/database/prisma/messaging-demo-seed.ts");
const MAIN_SEED = read("../../../../packages/database/prisma/seed.ts");
const SEED_IDS = read("../../../../packages/database/prisma/seed-ids.ts");

/** The exact predicate the routes apply. */
const zodUuid = z.uuid();

/** The formula the seeds used BEFORE the fix — kept only to prove it was broken. */
function legacyDid(namespace: string, key: string): string {
  const h = createHash("sha1").update(namespace + key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

describe("H-03 · P1 — the generator emits a genuine RFC 9562 UUIDv5", () => {
  it("matches the published name-based test vector", () => {
    // RFC 9562 §5.5 / the canonical uuid-library vector:
    // uuidv5("www.example.com", NAMESPACE_DNS)
    expect(uuidV5("www.example.com", NAMESPACE_DNS)).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("stamps version 5 and the RFC variant on every id", () => {
    const did = seedId("edura-preview:");
    for (let i = 0; i < 2000; i++) {
      const id = did(`fixture:${i}`);
      expect(id[14], `version nibble of ${id}`).toBe("5");
      expect("89ab", `variant nibble of ${id}`).toContain(id[19]!);
    }
  });

  it("rejects a namespace that is not itself a UUID", () => {
    expect(() => uuidV5("x", "not-a-uuid")).toThrow(/namespace/);
  });
});

describe("H-03 · P2 — seed ids and route validation agree, by construction", () => {
  it("the seed-side predicate agrees with z.uuid() on every uuid-shaped string", () => {
    // Equivalence, not a copied string: if zod ever changes its definition the
    // seed and the routes would drift apart silently, and this fails loudly.
    // Sweep BOTH discriminating nibbles exhaustively (version x variant) over a
    // set of otherwise-random bodies — that is exactly where the old ids failed.
    const hex = "0123456789abcdef";
    let checked = 0;
    for (const version of hex) {
      for (const variant of hex) {
        for (let n = 0; n < 8; n++) {
          const rand = (len: number) =>
            Array.from({ length: len }, (_, i) => hex[(n * 7 + i * 11 + len) % 16]).join("");
          const id = `${rand(8)}-${rand(4)}-${version}${rand(3)}-${variant}${rand(3)}-${rand(12)}`;
          expect(isRfcUuid(id), `disagreement on ${id}`).toBe(zodUuid.safeParse(id).success);
          checked++;
        }
      }
    }
    expect(checked).toBe(16 * 16 * 8);
    // And the two RFC special cases zod carves out explicitly.
    for (const special of [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ]) {
      expect(isRfcUuid(special)).toBe(zodUuid.safeParse(special).success);
    }
    expect(RFC_UUID.flags).toBe("");
  });

  it("every id BOTH seeds can mint is accepted by the real z.uuid()", () => {
    for (const prefix of ["edura-preview:", "edura-msgdemo:"]) {
      const did = seedId(prefix);
      for (let i = 0; i < 10_000; i++) {
        const id = did(`k:${i}`);
        expect(zodUuid.safeParse(id).success, `${prefix}k:${i} -> ${id}`).toBe(true);
      }
    }
  });

  it("accepts the exact ids the report named as rejected fixtures", () => {
    const preview = seedId("edura-preview:");
    const msg = seedId("edura-msgdemo:");
    const fixtures = [
      preview("room:NILE"),
      preview("course:x:y"),
      preview("sess:a:b"),
      preview("grade:c:main"),
      msg("center:alpha"),
      msg("group:alpha-physics"),
      msg("conv:youssef-mona"),
      msg("youssef"),
    ];
    for (const id of fixtures) expect(zodUuid.safeParse(id).success, id).toBe(true);
  });

  it("the generator refuses to hand back a non-RFC id (assertRfcUuid is wired)", () => {
    expect(SEED_IDS).toMatch(/assertRfcUuid\(uuidV5\(prefix \+ key\)/);
    expect(isRfcUuid("8a0f946b-50c3-2304-1d26-fecd09ce863d")).toBe(false);
  });
});

describe("H-03 · P3 — the old formula really was invalid (regression witness)", () => {
  it("the seeded ids quoted in the verification report fail z.uuid()", () => {
    const reported = [
      "95dc5203-55f8-087f-8fb6-aa5952a69773", // NILE scheduled session
      "8a0f946b-50c3-2304-1d26-fecd09ce863d", // NILE completed session
      "4d1da783-79dc-f1b8-a948-c3e90e460997", // NILE course
      "2e3eb8fb-56ab-f1e7-9eff-31dc0ae2a464", // NILE room
      "4a747023-75a3-d394-36a5-d1bf5ef4f0da", // demo conversation
      "225522a5-3151-9a06-81be-4d3ef31059ef", // demo group
      "2dfbea05-4c2b-21de-66c7-1da369e7a5a9", // demo messaging user
    ];
    for (const id of reported) expect(zodUuid.safeParse(id).success, id).toBe(false);
  });

  it("the legacy formula produces invalid ids at roughly the 7-in-8 rate", () => {
    let invalid = 0;
    for (let i = 0; i < 4000; i++) {
      if (!zodUuid.safeParse(legacyDid("edura-preview:", `k:${i}`)).success) invalid++;
    }
    // 8/16 version nibbles x 4/16 variant nibbles are valid -> ~87.5% invalid.
    expect(invalid).toBeGreaterThan(3200);
  });
});

describe("H-03 · P4 — ids stay deterministic and namespace-separated", () => {
  it("the same key always yields the same id (seeds stay idempotent)", () => {
    const a = seedId("edura-preview:");
    const b = seedId("edura-preview:");
    expect(a("room:NILE")).toBe(b("room:NILE"));
  });

  it("the two seeds cannot collide on the same key", () => {
    const preview = seedId("edura-preview:");
    const msg = seedId("edura-msgdemo:");
    for (const key of ["center:alpha", "room:NILE", "youssef", "conv:1"]) {
      expect(preview(key)).not.toBe(msg(key));
    }
  });

  it("distinct keys yield distinct ids across a large key space", () => {
    const did = seedId("edura-preview:");
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(did(`k:${i}`));
    expect(seen.size).toBe(20_000);
  });
});

describe("H-03 · P5 — one implementation; no seed hand-rolls its own", () => {
  const HAND_ROLLED = /slice\(0,\s*8\)\}-\$\{[a-z]*\.slice\(8,\s*12\)/;

  it("no seed builds a uuid by slicing a digest any more", () => {
    for (const [name, src] of [
      ["preview-seed.ts", PREVIEW_SEED],
      ["messaging-demo-seed.ts", MESSAGING_SEED],
      ["seed.ts", MAIN_SEED],
    ] as const) {
      expect(HAND_ROLLED.test(src), `${name} hand-rolls a uuid`).toBe(false);
    }
  });

  it("both id-minting seeds get their generator from the shared module", () => {
    for (const [name, src] of [
      ["preview-seed.ts", PREVIEW_SEED],
      ["messaging-demo-seed.ts", MESSAGING_SEED],
    ] as const) {
      expect(src, name).toMatch(/import \{ seedId \} from "\.\/seed-ids"/);
      expect(src, name).toMatch(/const did = seedId\("/);
    }
  });

  it("the main seed mints no ids of its own at all (the DB generates them)", () => {
    expect(MAIN_SEED).not.toMatch(/seedId\(/);
    // Its only createHash use is the family link code, not an id.
    const hashes = MAIN_SEED.match(/createHash\(/g) ?? [];
    expect(hashes.length).toBe(1);
  });
});

describe("H-03 · P6 — the routes were NOT weakened", () => {
  const routes = {
    "center/checkin": read("../../src/app/api/v1/center/checkin/route.ts"),
    "center/subscriptions": read("../../src/app/api/v1/center/subscriptions/route.ts"),
    "subscriptions/checkout": read("../../src/app/api/v1/subscriptions/checkout/route.ts"),
    "payments/initiate": read("../../src/app/api/v1/payments/initiate/route.ts"),
    "messages/conversations": read("../../src/app/api/v1/messages/conversations/route.ts"),
    "messages/reports": read("../../src/app/api/v1/messages/reports/route.ts"),
  };

  it("every field the report listed still carries UUID validation", () => {
    const uuid = String.raw`(z\.uuid\(\)|z\.string\(\)\.uuid\(\))`;
    const required: [keyof typeof routes, string][] = [
      ["center/checkin", "studentId"],
      ["center/checkin", "sessionId"],
      ["center/subscriptions", "studentId"],
      ["center/subscriptions", "courseId"],
      ["center/subscriptions", "sessionId"],
      ["subscriptions/checkout", "courseId"],
      ["subscriptions/checkout", "sessionId"],
      ["payments/initiate", "courseId"],
      ["messages/conversations", "recipientId"],
      ["messages/reports", "conversationId"],
      ["messages/reports", "reportedUserId"],
      ["messages/reports", "messageId"],
      ["messages/reports", "groupId"],
    ];
    for (const [route, field] of required) {
      expect(routes[route], `${route}.${field}`).toMatch(new RegExp(`${field}:\\s*${uuid}`));
    }
  });

  it("no route pins a version or otherwise loosens the check", () => {
    for (const [name, src] of Object.entries(routes)) {
      // A `version:` option or a bare `z.string()` where a uuid used to be
      // would both be a weakening of the guard rather than a fix to the data.
      expect(src, name).not.toMatch(/uuid\(\s*\{/);
      expect(src, name).not.toMatch(/uuid\(\s*["']/);
    }
  });
});
