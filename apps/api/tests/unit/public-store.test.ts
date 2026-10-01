import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake ioredis: enough of GET/SET/INCR for the store, with a switch that makes
// every command fail so the Redis-down path can be exercised without a server.
const fake = {
  data: new Map<string, string>(),
  down: false,
  constructed: 0,
  calls: [] as string[],
};

class FakeRedis {
  constructor() {
    fake.constructed++;
  }
  on() {
    return this;
  }
  private guard(cmd: string) {
    fake.calls.push(cmd);
    if (fake.down) throw new Error("ECONNREFUSED");
  }
  async get(key: string) {
    this.guard("get");
    return fake.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.guard("set");
    fake.data.set(key, value);
    return "OK";
  }
  async incr(key: string) {
    this.guard("incr");
    const next = Number(fake.data.get(key) ?? "0") + 1;
    fake.data.set(key, String(next));
    return next;
  }
  disconnect() {}
  async quit() {
    return "OK";
  }
}

// apps/api does not depend on ioredis, so the factory type comes from the store.
const fakeFactory = (async () => new FakeRedis()) as unknown as NonNullable<
  Parameters<typeof __setRedisFactoryForTests>[0]
>;

import {
  __publicStoreKeysForTests,
  __resetPublicStoreForTests,
  __setRedisFactoryForTests,
  bumpPublicDataTag,
  cachedRead,
} from "@repo/server-core/cache/public-store";

const read = (name: string, args?: unknown[], ttlSeconds = 60) => ({
  tag: "catalog",
  name,
  args,
  ttlSeconds,
});

function loaderOf<T>(values: T[]) {
  let i = 0;
  const loader = vi.fn(async () => values[Math.min(i++, values.length - 1)]!);
  return loader;
}

async function flush() {
  // Lets the fire-and-forget Redis bump and set land.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe.each([
  ["in-process map", undefined],
  ["redis", "redis://cache.test:6379"],
] as const)("public store over %s", (_label, redisUrl) => {
  beforeEach(() => {
    __resetPublicStoreForTests();
    __setRedisFactoryForTests(fakeFactory);
    fake.data.clear();
    fake.down = false;
    fake.calls.length = 0;
    vi.useFakeTimers();
    if (redisUrl) process.env.REDIS_URL = redisUrl;
    else delete process.env.REDIS_URL;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.REDIS_URL;
    __resetPublicStoreForTests();
    __setRedisFactoryForTests(null);
  });

  it("serves the second call from the store and reloads after the TTL", async () => {
    const loader = loaderOf([{ v: 1 }, { v: 2 }]);
    expect(await cachedRead(read("r"), loader)).toEqual({ v: 1 });
    await flush();
    expect(await cachedRead(read("r"), loader)).toEqual({ v: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fake.constructed).toBe(redisUrl ? 1 : 0);

    vi.setSystemTime(Date.now() + 61_000);
    if (redisUrl) {
      // The fake has no expiry; Redis's PX would have dropped the entry.
      fake.data.clear();
    }
    expect(await cachedRead(read("r"), loader)).toEqual({ v: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keys on the reader's name and arguments, not just the tag", async () => {
    const a = loaderOf(["a"]);
    const b = loaderOf(["b"]);
    expect(await cachedRead(read("one"), a)).toBe("a");
    await flush();
    expect(await cachedRead(read("two"), b)).toBe("b");
    await flush();
    expect(await cachedRead(read("two", [["g1"]]), b)).toBe("b");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("a tag bump makes the next read reload", async () => {
    const loader = loaderOf([1, 2]);
    expect(await cachedRead(read("r"), loader)).toBe(1);
    await flush();
    bumpPublicDataTag("catalog");
    await flush();
    expect(await cachedRead(read("r"), loader)).toBe(2);
    // Another tag's bump leaves this one alone.
    bumpPublicDataTag("discovery");
    await flush();
    expect(await cachedRead(read("r"), loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("returns Dates as Dates from a stored entry, and caches null", async () => {
    const when = new Date("2026-09-01T10:00:00.000Z");
    const loader = loaderOf([{ startDate: when, endDate: null, nested: [{ at: when }] }]);
    await cachedRead(read("dates"), loader);
    await flush();
    const hit = (await cachedRead(read("dates"), loader)) as {
      startDate: Date;
      endDate: null;
      nested: { at: Date }[];
    };
    expect(hit.startDate).toBeInstanceOf(Date);
    expect(hit.startDate.toISOString()).toBe(when.toISOString());
    expect(hit.endDate).toBeNull();
    expect(hit.nested[0]!.at).toBeInstanceOf(Date);
    expect(loader).toHaveBeenCalledTimes(1);

    const nullLoader = loaderOf([null, "later"]);
    expect(await cachedRead(read("missing"), nullLoader)).toBeNull();
    await flush();
    expect(await cachedRead(read("missing"), nullLoader)).toBeNull();
    expect(nullLoader).toHaveBeenCalledTimes(1);
  });

  it("does not cache a loader error", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("ok");
    await expect(cachedRead(read("err"), loader)).rejects.toThrow("db down");
    await flush();
    expect(await cachedRead(read("err"), loader)).toBe("ok");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("public store when redis fails", () => {
  beforeEach(() => {
    __resetPublicStoreForTests();
    __setRedisFactoryForTests(fakeFactory);
    fake.data.clear();
    fake.down = false;
    fake.calls.length = 0;
    process.env.REDIS_URL = "redis://cache.test:6379";
  });
  afterEach(() => {
    delete process.env.REDIS_URL;
    __resetPublicStoreForTests();
    __setRedisFactoryForTests(null);
    vi.restoreAllMocks();
  });

  it("calls the loader on every read, logs once, and never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.down = true;
    const loader = loaderOf([1, 2, 3]);
    expect(await cachedRead(read("r"), loader)).toBe(1);
    expect(await cachedRead(read("r"), loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(() => bumpPublicDataTag("catalog")).not.toThrow();
    await flush();
    expect(spy.mock.calls.filter(([m]) => String(m).includes("redis unavailable"))).toHaveLength(1);

    fake.down = false;
    expect(await cachedRead(read("r"), loader)).toBe(3);
    await flush();
    expect(await cachedRead(read("r"), loader)).toBe(3);
    expect(loader).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls.filter(([m]) => String(m).includes("redis recovered"))).toHaveLength(1);
  });

  it("uses the per-process map when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    __resetPublicStoreForTests();
    const loader = loaderOf(["x"]);
    await cachedRead(read("r"), loader);
    await cachedRead(read("r"), loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fake.calls).toEqual([]);
  });
});

describe("public store keys", () => {
  it("are namespaced per environment and versioned", () => {
    const { genKey, entryKey, argsHash } = __publicStoreKeysForTests;
    process.env.EDURA_ENV = "test";
    expect(genKey("catalog")).toBe("pubcache:v1:test:gen:catalog");
    expect(entryKey("catalog", 3, "abc")).toBe("pubcache:v1:test:catalog:3:abc");
    delete process.env.EDURA_ENV;
    expect(argsHash("a", [1])).toMatch(/^[0-9a-f]{64}$/);
    expect(argsHash("a", [1])).not.toBe(argsHash("b", [1]));
  });
});
