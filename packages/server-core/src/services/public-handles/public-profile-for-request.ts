import { presentedSessionTokens } from "../../auth/session-cookies";
import type { SessionUser } from "../../auth/types";
import { SESSION_COOKIE_PREFIX } from "../../erp-auth/cookie-prefix";
import { getSessionUser } from "../../erp-auth/session";
import { readPublicProfile, type PublicProfile } from "./public-profiles";
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
// The caller hands over the request's Cookie header; the session itself is read
// through getSessionUser, which the host binds to the same request.
export async function publicProfileForRequest(
  handle: string,
  cookieHeader: string | null,
): Promise<PublicProfile | null> {
  const shared = await resolvePublicProfileAnonymous(handle);
  if (presentedSessionTokens(cookieHeader, SESSION_COOKIE_PREFIX).length === 0) return shared;
  if (!shared) return readPublicProfile(handle);
  const viewer = await getSessionUser();
  return viewer && mayEditProfile(viewer, shared) ? readPublicProfile(handle) : shared;
}
