export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === "object") {
    const inner = value as { data?: unknown; items?: unknown };
    if (Array.isArray(inner.data)) return inner.data as T[];
    if (Array.isArray(inner.items)) return inner.items as T[];
  }
  return [];
}
