/**
 * Escape hatch for RUNTIME-computed translation keys (e.g. `status.${code}`,
 * `roles.${role}`) that TypeScript can't verify against the typed key union but
 * which are known to exist in the catalog. Every OTHER `t()` call stays fully
 * typed — only genuinely dynamic keys route through here.
 *
 * The generic return type is inferred from the call context: when used as
 * `t(asKey(x))`, `T` unifies with the exact key type `t` expects. When stored
 * first, it falls back to `never` (assignable to any key parameter).
 */
export function asKey<T = never>(key: string): T {
  return key as T;
}
