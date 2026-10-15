export type KeyValueMode = "redis" | "memory";

/** `redis` when REDIS_URL is set (the prod guard in rate-limit/require-shared-store.ts requires it), else `memory`. */
export function keyValueMode(env: NodeJS.ProcessEnv = process.env): KeyValueMode {
  return env.REDIS_URL ? "redis" : "memory";
}

export type TokenBucketInput = {
  capacity: number;
  refillPerMs: number;
  now: number;
  ttlMs: number;
};

export interface KeyValueStore {
  readonly name: KeyValueMode;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  incr(key: string): Promise<number>;
  /** Atomically takes one token from the bucket at `key`; false when it is empty. */
  takeToken(key: string, bucket: TokenBucketInput): Promise<boolean>;
  close(): Promise<void>;
  disconnect(): void;
}
