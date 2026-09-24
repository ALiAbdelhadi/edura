import { cacheLife, cacheTag } from "next/cache";
import { PUBLIC_DATA_TAGS } from "@repo/server-core/cache/public-data";
import {
  searchCourseRows,
  searchTeacherDayRows,
  withCourseLiveState,
  withTeacherDayLiveState,
  type StudentCatalogScope,
} from "./discovery";

// Server-side memo for the discovery searches — the ROWS only (see the seam
// described above searchCourseRows). Seats and upcoming sessions are recomputed
// on every request, so a screen that refetches after a subscription still sees
// the seat it just took.
//
// WHY THIS IS SAFE TO SHARE BETWEEN USERS. The cache key is the arguments, and
// the arguments are the normalized filters plus a StudentCatalogScope — a grade
// and a track, not a person. The session is read in the route, BEFORE this, to
// decide which scope applies, and `assertApprovedChild` runs there on every
// request. Nothing that identifies the caller ever reaches these functions; if
// that changes, this file stops being correct.
//
// THE FRESHNESS BOUND IS `revalidate`, NOT `expire`. Next 16.3's default
// "use cache" handler is an in-memory LRU per process, and in production it
// treats an entry past `revalidate` as missing (no stale serving). So a teacher's
// edit, a new course, or a suspended centre reaches search within 60 seconds —
// the same bound the CDN (Tier 2) and QUERY_FRESHNESS.discovery already use for
// every other public listing.
//
// "use cache: remote" + invalidation make it SOONER, not correct: ERP writes
// that change these rows are wrapped in `invalidatesPublicData`, and back-office
// writes reach /api/v1/internal/revalidate through the audit listener. Where the
// platform supplies a shared handler, one revalidation clears every instance;
// where it does not, Next falls back to the per-process handler and the 60s
// bound is what holds.
//
// Must NOT be imported from a DB suite: cacheTag() throws outside the Next
// runtime. Tests call searchCourses / searchTeachersByDay, which are uncached.

export const DISCOVERY_CACHE_TAG = PUBLIC_DATA_TAGS.discovery;
export const DISCOVERY_CACHE_LIFE = { stale: 30, revalidate: 60, expire: 300 };

type CourseFilters = Parameters<typeof searchCourseRows>[0];
type TeacherDayFilters = Parameters<typeof searchTeacherDayRows>[0];

async function cachedCourseRows(filters: CourseFilters, scope: StudentCatalogScope | null) {
  "use cache: remote";
  cacheTag(DISCOVERY_CACHE_TAG);
  cacheLife(DISCOVERY_CACHE_LIFE);
  return searchCourseRows(filters, scope);
}

async function cachedTeacherDayRows(
  filters: TeacherDayFilters,
  scope: StudentCatalogScope | null,
) {
  "use cache: remote";
  cacheTag(DISCOVERY_CACHE_TAG);
  cacheLife(DISCOVERY_CACHE_LIFE);
  return searchTeacherDayRows(filters, scope);
}

// The scope is rebuilt field by field so nothing else that happens to ride on
// the object can widen the key — or leak into it.
const keyScope = (scope?: StudentCatalogScope | null): StudentCatalogScope | null =>
  scope ? { gradeLevelId: scope.gradeLevelId, trackId: scope.trackId ?? null } : null;

export async function searchCoursesCached(
  filters: CourseFilters,
  scope?: StudentCatalogScope | null,
) {
  return withCourseLiveState(await cachedCourseRows(filters, keyScope(scope)));
}

export async function searchTeachersByDayCached(
  filters: TeacherDayFilters,
  scope?: StudentCatalogScope | null,
) {
  return withTeacherDayLiveState(await cachedTeacherDayRows(filters, keyScope(scope)));
}
