// The shared vocabulary for cached PUBLIC data: which datasets exist, the cache
// tag each one is stored under, and which back-office writes change which ones.
// Both apps read this file so the tag a cache is written under and the tag a
// write invalidates can never drift apart.
//
// What invalidation is FOR. Every cached read carries its own freshness bound
// (`revalidate`, 60s for all of these) and that bound is the
// guarantee. Invalidation only makes an edit visible SOONER. So a write site that
// is not wired here is not a correctness bug — its edit still appears within the
// bound — and over-invalidating is harmless: the next read refills the entry.

export const PUBLIC_DATA_TAGS = {
  catalog: "catalog",
  discovery: "discovery",
  publicProfile: "public-profile",
} as const;

export type PublicDataset = keyof typeof PUBLIC_DATA_TAGS;

export const PUBLIC_DATASETS = Object.keys(PUBLIC_DATA_TAGS) as PublicDataset[];

// The Egyptian education catalog. Subject names also appear inside discovery
// rows (subjectRef), so a catalog edit clears discovery too.
const CATALOG_TARGETS = new Set([
  "education_system",
  "stage",
  "grade_level",
  "grade_level_track",
  "track",
  "subject",
  "subject_offering",
  "subject_request",
]);

// What appears in search results and on public profiles: centres, courses,
// teachers and their names, and a collaboration decision (which can create a
// course). `user` covers suspension and renames, which hide or relabel a teacher.
const PUBLIC_TARGETS = new Set(["center", "course", "teacher", "user", "collaboration_request"]);

// A hall's amenities are shown on its centre's public profile. Halls are not in
// search results, so discovery is left alone.
const PROFILE_ONLY_TARGETS = new Set(["room"]);

export function datasetsForAuditTarget(targetType: string): PublicDataset[] {
  if (CATALOG_TARGETS.has(targetType)) return ["catalog", "discovery"];
  if (PROFILE_ONLY_TARGETS.has(targetType)) return ["publicProfile"];
  if (PUBLIC_TARGETS.has(targetType)) return ["discovery", "publicProfile"];
  return [];
}

// What an ERP write that changes a public listing or profile invalidates.
export const PUBLIC_WRITE: PublicDataset[] = ["discovery", "publicProfile"];

// Expiring a tag is bound per host, and both hosts bind the same thing: the
// shared store's `bumpPublicDataTag` (cache/public-store.ts) — apps/erp in
// next-bindings.ts, apps/api in src/cache.ts. A host that binds nothing reports
// every invalidation as failed rather than silently doing nothing.
export type PublicDataInvalidator = (tag: string) => void;

let invalidator: PublicDataInvalidator = (tag) => {
  throw new Error(`no public-data invalidator bound for "${tag}"`);
};

export function setPublicDataInvalidator(fn: PublicDataInvalidator): void {
  invalidator = fn;
}

// Expires the given datasets NOW, so the next read refills them rather than
// being served the entry the write just made wrong.
//
// Call it only once the write has COMMITTED. Invalidating first would let a read
// that lands in between refill the cache from the pre-commit rows, and the edit
// would then sit invisible for a whole `revalidate` window. The wrapper below is
// the safe way to get that ordering.
//
// Never throws. The write it follows already succeeded; failing the request
// because a cache could not be told would report a saved change as an error.
// The data's own `revalidate` bound still holds either way.
export function invalidatePublicData(...datasets: PublicDataset[]): void {
  for (const tag of new Set(datasets.map((d) => PUBLIC_DATA_TAGS[d]))) {
    try {
      invalidator(tag);
    } catch (err) {
      console.error(`[cache] could not invalidate "${tag}"`, err);
    }
  }
}

// Wraps a write route: runs it, and on a successful response (below 400)
// invalidates `datasets`. The handler has returned — so its transaction has
// committed — before anything is invalidated.
export function invalidatesPublicData<A extends unknown[], R extends Response>(
  handler: (...args: A) => R | Promise<R>,
  datasets: PublicDataset[] = PUBLIC_WRITE,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res.status < 400) invalidatePublicData(...datasets);
    return res;
  };
}
