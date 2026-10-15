import type { Redis, RedisOptions } from "ioredis";
import type { KeyValueStore } from "./types";

export type RedisClientFactory = (url: string, options: RedisOptions) => Promise<Redis>;

export const defaultRedisClientFactory: RedisClientFactory = async (url, options) => {
  const { default: RedisCtor } = await import("ioredis");
  return new RedisCtor(url, options);
};

const BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refillPerMs)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], ttl)
return allowed
`;

export function redisStore(client: Redis): KeyValueStore {
  return {
    name: "redis",
    get: (key) => client.get(key),
    async set(key, value, ttlMs) {
      await client.set(key, value, "PX", ttlMs);
    },
    incr: (key) => client.incr(key),
    async takeToken(key, { capacity, refillPerMs, now, ttlMs }) {
      const res = await client.eval(BUCKET_LUA, 1, key, capacity, refillPerMs, now, ttlMs);
      return Number(res) === 1;
    },
    async close() {
      await client.quit().catch(() => client.disconnect());
    },
    disconnect: () => client.disconnect(),
  };
}
