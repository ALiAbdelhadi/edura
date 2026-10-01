import { requestHeaders, requestMemo } from "../http/request-context";
import type { ErpAuth } from "./create-auth";
import { erpAuth } from "./instance";

export type AuthSessionResult = Awaited<ReturnType<ErpAuth["api"]["getSession"]>>;

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
// The memo is per-request and is discarded when the request ends, so there is no
// freshness to trade: two reads inside one request cannot legitimately disagree.
// It is NOT a cross-request cache and must never be mistaken for one.
//
// Outside a request scope (unit tests) there is no memo and this degrades to a
// plain call, so behaviour under test is unchanged. The headers are a real
// `Headers` at runtime in both hosts (Next's ReadonlyHeaders, a Request's own).
export const readAuthSession = requestMemo(
  async (): Promise<AuthSessionResult> =>
    erpAuth().api.getSession({ headers: (await requestHeaders()) as Headers }),
);
