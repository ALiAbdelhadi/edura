import { auth } from "@/lib/auth/auth";
import { APIError } from "better-auth/api";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * THE LANDING DOOR for a back-office "view as".
 *
 * apps/superadmin renders a self-submitting form that POSTs the signed handoff
 * token here as a TOP-LEVEL NAVIGATION. Three consequences, all deliberate:
 *
 *  * A form navigation, not `fetch`. The response can therefore both set the
 *    session cookie and 303 the browser into the portal in one hop, and no CORS
 *    preflight is involved.
 *  * A plain Next route rather than better-auth's own HTTP handler. better-auth
 *    enforces `trustedOrigins` on its endpoints, and this request legitimately
 *    arrives from the OTHER app's origin — a check designed to stop exactly
 *    this shape of request. Calling `auth.api.claimViewAs` server-side runs the
 *    same endpoint logic with the origin check out of the path, which is the
 *    same pattern the back office already uses for `impersonateUser`. The token
 *    signature is what authenticates the request; the Origin header was never
 *    going to be.
 *  * The token travels in a POST BODY, never a query string, so it does not
 *    land in browser history, referrers or access logs.
 *
 * On any failure this redirects to the login page rather than rendering an
 * error: whoever ends up here without a valid token is a browser that should be
 * signing in normally.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = typeof form?.get("token") === "string" ? String(form.get("token")) : "";

  const fail = () => NextResponse.redirect(new URL("/login", req.url), 303);
  if (!token) return fail();

  let result: {
    headers: Headers;
    response: { user?: { locale?: string } };
  };
  try {
    const { headers, response } = await auth.api.claimViewAs({
      body: { token },
      headers: req.headers,
      returnHeaders: true,
    });
    result = { headers, response: response as { user?: { locale?: string } } };
  } catch (e) {
    // A refused or replayed token is an ordinary outcome here, not an incident:
    // forwarding better-auth's typed APIError as a 500 is how an expired token
    // would page whoever owns Sentry. Anything else is genuinely unexpected.
    if (e instanceof APIError) return fail();
    throw e;
  }

  const locale = result.response.user?.locale === "en" ? "en" : "ar";
  // `/[locale]/dashboard` is the ONE role -> portal router (it reads the live
  // session via /api/v1/me). Sending the browser there rather than computing a
  // portal here keeps a second copy of that map from existing.
  const res = NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url), 303);
  for (const cookie of result.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
