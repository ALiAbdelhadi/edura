import type { RedisOptions } from "ioredis";
import { defaultRedisClientFactory, redisStore, type RedisClientFactory } from "./redis-driver";
import type { KeyValueStore } from "./types";

export type { KeyValueStore, KeyValueMode, TokenBucketInput } from "./types";
export { keyValueMode } from "./types";
export { createMemoryStore, type MemoryKeyValueStore } from "./memory-driver";
export type { RedisClientFactory } from "./redis-driver";

const BASE_REDIS_OPTIONS: RedisOptions = { maxRetriesPerRequest: 1, connectTimeout: 5000 };

/**
 * Opens a Redis-backed store over `url`, or returns null when `url` is empty or
 * the client cannot be built — the caller then serves from its memory store.
 * Each consumer opens its own connection: their client options differ on
 * purpose (public-store fails fast offline; the rate limiter queues).
 */
export async function resolveKeyValueStore(opts: {
  url: string | undefined;
  options?: RedisOptions;
  onError: (err: Error) => void;
  onInitError: (err: Error) => void;
  factory?: RedisClientFactory;
}): Promise<KeyValueStore | null> {
  if (!opts.url) return null;
  try {
    const client = await (opts.factory ?? defaultRedisClientFactory)(opts.url, {
      ...BASE_REDIS_OPTIONS,
      ...opts.options,
    });
    client.on("error", opts.onError);
    return redisStore(client);
  } catch (err) {
    opts.onInitError(err as Error);
    return null;
  }
}
