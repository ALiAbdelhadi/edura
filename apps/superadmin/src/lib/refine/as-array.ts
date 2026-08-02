/**
 * The ONE way to read a `useCustom` payload as a list.
 *
 * Refine v5 defaults `useCustom`'s payload to a frozen empty OBJECT, not an
 * array (`@refinedev/core@5.0.12`, src/hooks/data/useCustom.ts):
 *
 *     result: { data: queryResponse.data?.data || EMPTY_OBJECT }  // Object.freeze({})
 *
 * So `result.data` is `{}` before the request resolves — and equally when it
 * FAILS. The idiomatic guard does not catch that:
 *
 *     const rows = (result?.data as Row[] | undefined) ?? [];   // {} is not nullish
 *     rows.filter(...)                                          // TypeError
 *
 * The `as Row[] | undefined` annotation is what makes it look safe; TypeScript
 * was told a lie the runtime never honours. This crashed the student wallet
 * screen on first paint, and every other `?? []` site was one failed request
 * away from the same throw.
 *
 * `useList` / `useMany` default to `Object.freeze([])` and never had the
 * problem — `useCustom` is the odd one out, which is why the bug survived so
 * long in a codebase that reads lists everywhere.
 *
 * Pass the PAYLOAD, not the hook result: `asArray(histRes?.data)`. The
 * envelope tolerance (`{ data: [] }` / `{ items: [] }`) is here because a few
 * endpoints still answer in those shapes, so one helper covers every list.
 */
export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === "object") {
    const inner = value as { data?: unknown; items?: unknown };
    if (Array.isArray(inner.data)) return inner.data as T[];
    if (Array.isArray(inner.items)) return inner.items as T[];
  }
  return [];
}
