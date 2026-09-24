import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

export type AuthSessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

// One session read per request, shared by every consumer.
//
// `auth.api.getSession` is a database round trip: better-auth is configured with
// DB sessions and no `cookieCache`, deliberately, because hard revocation
// (users_revoke_sessions / token_version) depends on reading the row rather than
// trusting a cookie. That decision is correct and is NOT what this file changes.
//
// What it changes is how many times the SAME row is read while serving ONE
// request. A portal render used to read it twice — the layout through
// `requirePortal`, and `<ViewAsBanner />` through `getViewAsContext` — and the
// staff portal three times, because its page calls `requirePortal` again after
// its layout already did.
//
// `cache()` is per-request and is discarded when the request ends, so there is no
// freshness to trade: two reads inside one render cannot legitimately disagree.
// It is NOT a cross-request cache and must never be mistaken for one.
//
// Outside a request scope (unit tests) React has no async dispatcher and this
// degrades to a plain call, so behaviour under test is unchanged.
export const readAuthSession = cache(
  async (): Promise<AuthSessionResult> => auth.api.getSession({ headers: await headers() }),
);
