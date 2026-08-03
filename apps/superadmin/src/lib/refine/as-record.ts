/**
 * The ONE way to read a `useCustom` payload as a single OBJECT.
 *
 * The sibling of [asArray](./as-array.ts), for the other half of the same bug.
 * `asArray` fixed the sites that CRASHED; these are the sites that stayed
 * silent, which is why they outlived the fix.
 *
 * Refine v5 defaults the payload to a frozen empty OBJECT
 * (`@refinedev/core@5.0.12`, src/hooks/data/useCustom.ts):
 *
 *     result: { data: queryResponse.data?.data || EMPTY_OBJECT }  // Object.freeze({})
 *
 * `{}` is TRUTHY, so every guard written against the loading state is dead code:
 *
 *     const data = (result?.data as Payload) || null;
 *     if (isLoading && !result?.data) return <Skeleton />;   // never runs
 *     if (isError && !data) return <ErrorState />;           // never runs either
 *
 * The screen renders its success layout over a payload that does not exist,
 * so a still-loading report shows a skeleton-free flash of zeros and a FAILED
 * one shows zeros that look like real figures. No exception is thrown, nothing
 * reaches the error boundary, and the numbers are wrong in the one direction a
 * reader cannot detect — money screens that read as "0.00 EGP" rather than
 * "could not load".
 *
 * Pass the PAYLOAD, not the hook result: `asRecord(result?.data)`.
 *
 * A genuine `{}` response is indistinguishable from the sentinel — refine
 * erased that difference before we see it. Reading it as "not loaded" is the
 * safe direction: it shows a skeleton, where the alternative shows a lie.
 */
export function asRecord<T = unknown>(value: unknown): T | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.keys(value).length === 0 ? undefined : (value as T);
}

/**
 * The SHAPE-AGNOSTIC variant, for a generic passthrough that does not know
 * whether its endpoint answers with an object or a list — `useAdminGet` is the
 * only such caller here, and it is typed `<DeletionRow[]>` at some call sites
 * and `<{ rooms: RoomRow[] }>` at others.
 *
 * Use `asRecord` when the payload IS an object: it rejects an array, which is a
 * useful assertion at a site that expects one shape. Use `asData` when both are
 * legitimate — passing an array to `asRecord` yields `undefined`, which at a
 * list endpoint means a successful response reads as "never loaded" and the
 * screen renders permanently empty.
 *
 * Only the empty-object sentinel becomes `undefined`. An empty ARRAY is a real,
 * complete answer — "this centre has no blacklist entries" — and is passed
 * through untouched.
 */
export function asData<T = unknown>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return undefined;
  }
  return value as T;
}
