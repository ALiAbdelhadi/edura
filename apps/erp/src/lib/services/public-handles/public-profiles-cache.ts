import { cacheLife, cacheTag } from "next/cache";
import { PUBLIC_DATA_TAGS } from "@repo/server-core/cache/public-data";
import { NotFoundError } from "@/lib/errors/classes";
import {
  getCenterPublicProfile,
  readPublicProfile,
  withLiveEnrollment,
  type CenterPublicProfile,
} from "./public-profiles";

// Cross-request memo of a public profile. Who is served from it is decided in
// public-profile-for-request.ts, which reads the request; this file must never
// do so (use-cache-scope test).
//
// Everybody EXCEPT the people who can edit the profile is served from here —
// anonymous visitors, and signed-in visitors who are not its centre's staff,
// its teacher, or an assistant. Those editors are read fresh, so an owner who
// opens their page straight after saving always sees the save, whether or not
// invalidation has reached this instance.
//
// What a non-editor may see up to 60s late: the profile's text, logo, courses
// and rating, and a centre or teacher that was just suspended (the status gate
// is inside the cached value). Never late: enrollment counts, which
// withLiveEnrollment re-reads on every request. Invalidation (see
// discovery-cache.ts) usually makes it much sooner than 60s.
//
// A missing profile is cached too — an unknown or hidden handle 404s for up to
// 60s after it becomes valid, for non-editors. A handle is claimed before it is
// shared, so nobody is waiting on that minute.

export const PUBLIC_PROFILE_CACHE_TAG = PUBLIC_DATA_TAGS.publicProfile;
export const PUBLIC_PROFILE_CACHE_LIFE = { stale: 30, revalidate: 60, expire: 300 };

async function cachedPublicProfile(handle: string) {
  "use cache: remote";
  cacheTag(PUBLIC_PROFILE_CACHE_TAG);
  cacheLife(PUBLIC_PROFILE_CACHE_LIFE);
  return readPublicProfile(handle);
}

export async function resolvePublicProfileAnonymous(handle: string) {
  return withLiveEnrollment(await cachedPublicProfile(handle));
}

async function cachedCenterProfile(centerId: string): Promise<CenterPublicProfile | null> {
  "use cache: remote";
  cacheTag(PUBLIC_PROFILE_CACHE_TAG);
  cacheLife(PUBLIC_PROFILE_CACHE_LIFE);
  // NEVER let an error cross this boundary on purpose. A value leaving a
  // "use cache" function is RSC-serialized, and in production a thrown error
  // comes out as a generic Error with a digest — NOT a NotFoundError — so
  // withErrors would answer 500 instead of 404. A hidden centre is therefore a
  // cached `null`, and the real NotFoundError is thrown outside, below.
  try {
    return await getCenterPublicProfile(centerId);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

// For GET /api/v1/centers/[id]. That route reads no session (PUBLIC_ROUTES), so
// it cannot tell an owner from anyone else; it relies on invalidation plus the
// 60s bound. It used to sit on the CDN instead, which served `enrolledCount` and
// `totalStudents` up to two minutes old and which a revalidation cannot reach.
// A centre that becomes hidden 404s within the same 60s bound.
export async function getCenterPublicProfileShared(centerId: string): Promise<CenterPublicProfile> {
  const profile = await cachedCenterProfile(centerId);
  if (!profile) throw new NotFoundError("Center not found");
  return (await withLiveEnrollment(profile)) as CenterPublicProfile;
}
