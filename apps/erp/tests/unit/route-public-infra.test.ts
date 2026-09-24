import { describe, expect, it, vi } from "vitest";

// Outside the Next compiler "use cache" is an inert string, so the cached
// readers simply run; only cacheTag/cacheLife need stubbing. That keeps these
// tests on the REAL path — including the live enrollment overlay and the
// null -> NotFoundError conversion that keeps a hidden centre a 404.
vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {}, revalidateTag: () => {} }));

const platformDb = vi.fn();
vi.mock("@/lib/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
}));

const ping = await import("@/app/api/v1/%5Fping/route");
const centerById = await import("@/app/api/v1/centers/[id]/route");
const subjects = await import("@/app/api/v1/subjects/route");

describe("GET /api/v1/_ping", () => {
  it("returns 200 without touching anything", async () => {
    const res = await ping.GET(new Request("http://t.local/api/v1/_ping"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    expect(platformDb).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/centers/[id]", () => {
  it("returns the public center profile", async () => {
    const roomQueries: unknown[] = [];
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        center: {
          findFirst: async () => ({
            id: "c-1",
            name: "مركز النيل",
            shortId: "NILE",
            description: null,
            subjects: [],
            address: null,
            phone: null,
            whatsapp: null,
            email: null,
            logoUrl: null,
            area: null,
            governorate: null,
            publicHandle: null,
          }),
        },
        course: { findMany: async () => [] },
        user: { findMany: async () => [] },
        room: {
          findMany: async (args: unknown) => {
            roomQueries.push(args);
            return [{ facilities: ["wifi", "ac"] }, { facilities: ["ac", "شباك"] }];
          },
        },
        enrollment: { groupBy: async () => [] },
        review: {
          aggregate: async () => ({ _avg: { rating: 4.25 }, _count: { _all: 8 } }),
        },
      }),
    );
    const res = await centerById.GET(new Request("http://t.local/api/v1/centers/c-1"), {
      params: Promise.resolve({ id: "c-1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; rating: number; reviewCount: number; amenities: string[] };
    };
    expect(body.data).toMatchObject({ id: "c-1", rating: 4.3, reviewCount: 8 });
    // Merged across active halls, catalogue order, free text last.
    expect(body.data.amenities).toEqual(["ac", "wifi", "شباك"]);
    // A public page: only the amenity column is read — never a hall's name,
    // price or split — and only from active halls.
    expect(roomQueries).toEqual([
      { where: { centerId: "c-1", isActive: true }, select: { facilities: true } },
    ]);
  });

  it("404s for an unknown center, in the standard envelope", async () => {
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ center: { findFirst: async () => null } }),
    );
    const res = await centerById.GET(new Request("http://t.local/api/v1/centers/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });
});

describe("GET /api/v1/subjects", () => {
  it("returns only active subjects as the data envelope", async () => {
    const findMany = vi.fn(async () => [{ id: "s1", nameAr: "رياضيات" }]);
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ subject: { findMany } }),
    );
    const res = await subjects.GET(new Request("http://t.local/api/v1/subjects"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});
