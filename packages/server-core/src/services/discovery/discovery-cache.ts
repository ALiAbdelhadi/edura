import { PUBLIC_DATA_TAGS } from "../../cache/public-data";
import { cachedRead } from "../../cache/public-store";
import {
  searchCourseRows,
  searchTeacherDayRows,
  withCourseLiveState,
  withTeacherDayLiveState,
  type StudentCatalogScope,
} from "./discovery";

// Cross-request memo for the discovery searches — the ROWS only (see the seam
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
// THE FRESHNESS BOUND IS `revalidate`. An entry older than 60 seconds is a miss
// in the shared store (cache/public-store.ts), so a teacher's edit, a new course
// or a suspended centre reaches search within 60 seconds — the same bound the
// CDN (Tier 2) and QUERY_FRESHNESS.discovery already use for every other public
// listing. Invalidation makes it SOONER, not correct: ERP writes that change
// these rows are wrapped in `invalidatesPublicData`, and back-office writes
// reach /api/v1/internal/revalidate through the audit listener. The store is one
// Redis for every instance of both hosts, so one bump clears them all.
//
// Must NOT be imported from a DB suite: a suite that writes a course and
// searches for it would read the entry the write made stale. Tests call
// searchCourses / searchTeachersByDay, which are uncached.

export const DISCOVERY_CACHE_TAG = PUBLIC_DATA_TAGS.discovery;
export const DISCOVERY_CACHE_LIFE = { stale: 30, revalidate: 60, expire: 300 };

type CourseFilters = Parameters<typeof searchCourseRows>[0];
type TeacherDayFilters = Parameters<typeof searchTeacherDayRows>[0];

function cachedCourseRows(filters: CourseFilters, scope: StudentCatalogScope | null) {
  return cachedRead(
    {
      tag: DISCOVERY_CACHE_TAG,
      name: "discovery.courseRows",
      args: [filters, scope],
      ttlSeconds: DISCOVERY_CACHE_LIFE.revalidate,
    },
    () => searchCourseRows(filters, scope),
  );
}

function cachedTeacherDayRows(filters: TeacherDayFilters, scope: StudentCatalogScope | null) {
  return cachedRead(
    {
      tag: DISCOVERY_CACHE_TAG,
      name: "discovery.teacherDayRows",
      args: [filters, scope],
      ttlSeconds: DISCOVERY_CACHE_LIFE.revalidate,
    },
    () => searchTeacherDayRows(filters, scope),
  );
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
