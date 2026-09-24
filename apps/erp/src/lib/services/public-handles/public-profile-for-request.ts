import { headers } from "next/headers";
import { cache } from "react";
import { presentedSessionTokens } from "@repo/server-core/auth/session-cookies";
import type { SessionUser } from "@repo/server-core/auth/types";
import { getSessionUser } from "@/lib/auth/session";
import { SESSION_COOKIE_PREFIX } from "@/lib/auth/cookie-prefix";
import { resolvePublicProfile, type PublicProfile } from "./public-profiles";
import { resolvePublicProfileAnonymous } from "./public-profiles-cache";

// Could this viewer have just edited this profile? If so they read it fresh.
//
// Deliberately wider than "the owner": every staff member of the centre, the
// teacher, and ANY assistant (resolving which teacher an assistant serves would
// cost a query, and an assistant viewing another teacher's page is rare). Being
// wrong in this direction costs one uncached read; being wrong the other way
// shows an owner their pre-edit profile.
export function mayEditProfile(viewer: SessionUser, profile: PublicProfile): boolean {
  if (profile.kind === "center") {
    return (
      (viewer.role === "center_admin" || viewer.role === "center_staff") &&
      (!viewer.centerId || viewer.centerId === profile.id)
    );
  }
  return viewer.id === profile.id || viewer.role === "assistant";
}

// Which read serves this request.
//
//  - No session cookie at all: the shared cache. Costs no session query.
//  - A session cookie: the shared cache FIRST (it carries the profile's kind and
//    id, so ownership needs no extra query), then the session. An editor of this
//    profile, or anyone looking at a handle the cache says is missing, is read
//    fresh instead — an owner who claimed a handle a minute after someone
//    requested it must not be shown a 404.
//
// "Carrying a session cookie" reuses presentedSessionTokens, the one definition
// of a session cookie. An expired or garbage cookie resolves to no user, which is
// treated as a non-editor.
//
// Wrapped in React `cache()` so `generateMetadata` and the page body share ONE
// resolution per request, whichever path it takes.
export const publicProfileForRequest = cache(async (handle: string) => {
  const cookieHeader = (await headers()).get("cookie");
  const shared = await resolvePublicProfileAnonymous(handle);
  if (presentedSessionTokens(cookieHeader, SESSION_COOKIE_PREFIX).length === 0) return shared;
  if (!shared) return resolvePublicProfile(handle);
  const viewer = await getSessionUser();
  return viewer && mayEditProfile(viewer, shared) ? resolvePublicProfile(handle) : shared;
});
