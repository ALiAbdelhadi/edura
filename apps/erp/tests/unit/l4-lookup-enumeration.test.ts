import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// L4 — the roster student/teacher lookups are a global account-existence + PII
// oracle for any center_admin. This proves the remediation:
//   (1) the endpoints are rate-limited (throttle engages after the burst),
//   (2) they still work for legitimate use (existence + invite-sendable), and
//   (3) they expose LESS PII — only two booleans, never id / name / email.
//
// requireRole is mocked to a center_admin (auth is not what's under test), and
// scopedDb is mocked to a tiny fixture DB so the route logic runs without Neon.
// The rate limiter itself is the REAL in-memory limiter (REDIS_URL unset).
//
// The lookup logic now lives in @repo/server-core/services/center/roster (both
// apps run one implementation), and it reaches the database through the
// KERNEL's own module specifier — not through www's "@/lib/db/scope" alias. A
// mock on the alias alone therefore no longer intercepts it, so both specifiers
// are mocked with the SAME fixture below. What is under test is unchanged: the
// real route, the real service, and the real rate limiter.

// email/phone -> the matching user's status ("" fixture = no such account).
// Held on globalThis because the hoisted vi.mock factory below cannot close
// over a module-scope binding.
const G = globalThis as never as { __L4: Record<string, string> };
G.__L4 = {};
const setFixture = (f: Record<string, string>) => {
  G.__L4 = f;
};

vi.mock("@/lib/authz/require-role", () => ({
  requireRole: vi.fn(async () => ({
    id: "admin-1",
    role: "center_admin",
    centerId: "center-1",
    locale: "en",
  })),
}));

// scopedDb(user, cb) -> cb(fakeTx); fakeTx.user.findFirst reads the fixture by
// the exact email/phone in the where-clause and returns { status } | null.
// `vi.hoisted` because vi.mock factories are hoisted above ordinary consts —
// this is what lets BOTH specifiers share one fixture implementation.
const { scopedDbMock } = vi.hoisted(() => ({
  scopedDbMock: () => ({
    scopedDb: async (_user: unknown, cb: (tx: unknown) => unknown) => {
      const tx = {
        user: {
          findFirst: async ({ where }: { where: { email?: string; phone?: string } }) => {
            const keyVal = where.email ?? where.phone;
            const status = keyVal ? (globalThis as never as { __L4: Record<string, string> })
              .__L4[keyVal]
              : undefined;
            return status ? { status } : null;
          },
        },
      };
      return cb(tx);
    },
  }),
}));

vi.mock("@/lib/db/scope", scopedDbMock);
// The same fixture behind the kernel's specifier — see the note above.
vi.mock("@repo/server-core/db/scope", scopedDbMock);

import * as students from "@/app/api/v1/roster/students/lookup/route";
import * as teachers from "@/app/api/v1/roster/teachers/lookup/route";
import { __resetRateLimiterForTests } from "@/lib/rate-limit/token-bucket";

const ctx = { params: Promise.resolve({}) };
const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const STUDENTS = "/api/v1/roster/students/lookup";
const TEACHERS = "/api/v1/roster/teachers/lookup";

beforeEach(() => {
  vi.stubEnv("REDIS_URL", ""); // force the in-memory limiter
  __resetRateLimiterForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimiterForTests();
});

describe("L4 — lookups still work for legitimate use (existence + invite-sendable)", () => {
  it("student: registered account → found, NOT invite-sendable", async () => {
    setFixture({ "reg@x.io": "active" });
    const res = await students.POST(post(STUDENTS, { email: "reg@x.io" }), ctx);
    const body = (await res.json()) as { data: { found: boolean; inviteSendable: boolean } };
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ found: true, inviteSendable: false });
  });

  it("student: shell account → found AND invite-sendable", async () => {
    setFixture({ "shell@x.io": "shell" });
    const res = await students.POST(post(STUDENTS, { email: "shell@x.io" }), ctx);
    const body = (await res.json()) as { data: { found: boolean; inviteSendable: boolean } };
    expect(body.data).toEqual({ found: true, inviteSendable: true });
  });

  it("student: no account (by phone) → not found, invite-sendable", async () => {
    setFixture({});
    const res = await students.POST(post(STUDENTS, { phone: "+201000000000" }), ctx);
    const body = (await res.json()) as { data: { found: boolean; inviteSendable: boolean } };
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ found: false, inviteSendable: true });
  });

  it("teacher: registered → found, NOT invite-sendable (collab-request path)", async () => {
    setFixture({ "t@x.io": "active" });
    const res = await teachers.POST(post(TEACHERS, { email: "t@x.io" }), ctx);
    const body = (await res.json()) as { data: { found: boolean; inviteSendable: boolean } };
    expect(body.data).toEqual({ found: true, inviteSendable: false });
  });

  it("teacher: absent → not found, invite-sendable", async () => {
    setFixture({});
    const res = await teachers.POST(post(TEACHERS, { email: "nobody@x.io" }), ctx);
    const body = (await res.json()) as { data: { found: boolean; inviteSendable: boolean } };
    expect(body.data).toEqual({ found: false, inviteSendable: true });
  });
});

describe("L4 — the response exposes LESS PII (only two booleans)", () => {
  it("student: no id / name / email in the body, even for a real account", async () => {
    setFixture({ "victim@x.io": "active" });
    const res = await students.POST(post(STUDENTS, { email: "victim@x.io" }), ctx);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(["found", "inviteSendable"]);
    expect(JSON.stringify(body)).not.toContain("victim@x.io"); // email not echoed
    for (const leaked of ["id", "name", "email", "phone"]) {
      expect(body.data).not.toHaveProperty(leaked);
    }
  });

  it("teacher: no id / name / email in the body", async () => {
    setFixture({ "victim@x.io": "shell" });
    const res = await teachers.POST(post(TEACHERS, { email: "victim@x.io" }), ctx);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(["found", "inviteSendable"]);
    for (const leaked of ["id", "name", "email", "phone"]) {
      expect(body.data).not.toHaveProperty(leaked);
    }
  });
});

describe("L4 — the throttle engages (can no longer sweep the user base)", () => {
  it("student lookup: 20-burst allowed, the 21st is 429 rate_limited", async () => {
    setFixture({ "sweep@x.io": "active" });
    for (let i = 0; i < 20; i++) {
      const res = await students.POST(post(STUDENTS, { email: "sweep@x.io" }), ctx);
      expect(res.status).toBe(200);
    }
    const blocked = await students.POST(post(STUDENTS, { email: "sweep@x.io" }), ctx);
    const body = (await blocked.json()) as { error: { code: string } };
    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
  });

  it("teacher lookup: independently throttled (own path key)", async () => {
    setFixture({});
    for (let i = 0; i < 20; i++) {
      const res = await teachers.POST(post(TEACHERS, { email: `x${i}@x.io` }), ctx);
      expect(res.status).toBe(200);
    }
    const blocked = await teachers.POST(post(TEACHERS, { email: "x99@x.io" }), ctx);
    expect(blocked.status).toBe(429);
  });
});
