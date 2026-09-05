export function asRecord<T = unknown>(value: unknown): T | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.keys(value).length === 0 ? undefined : (value as T);
}

export function asData<T = unknown>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return undefined;
  }
  return value as T;
}
