// The shared vocabulary for cached PUBLIC data: which datasets exist, the cache
// tag each one is stored under, and which back-office writes change which ones.
// Both apps read this file so the tag a cache is written under and the tag a
// write invalidates can never drift apart.
//
// What invalidation is FOR. Every cached read in apps/erp carries its own
// freshness bound (`revalidate`, 60s for all of these) and that bound is the
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
