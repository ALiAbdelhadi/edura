"use client";

import { useEffect } from "react";
import type { SessionLike } from "@repo/observability";
import { identifyUser } from "./posthog-client";

/**
 * Tells PostHog who is here.
 *
 * ── WHY THIS IS NOT IN `AnalyticsProvider` ────────────────────────────────
 *
 * It used to be. The provider took a `session` prop, and the ROOT layout filled
 * it by calling `getSessionUser()` — one `await` on cookies, in the layout every
 * page in the app renders under. That single read forced all 122 erp pages to be
 * server-rendered on every request, including `/help`, `/faq`, `/terms` and
 * `/pricing`, which declare `generateStaticParams` and have nothing per-user on
 * them at all.
 *
 * The identity is now supplied by the six portal layouts, which ALREADY read the
 * session — `requirePortal()` returns the very user this needs — so nothing is
 * fetched twice and nothing is identified a round trip later than before. The
 * root layout reads nothing, and the public pages prerender.
 *
 * ── `undefined` IS NOT `null`, AND THE DIFFERENCE MATTERS ─────────────────
 *
 * `identifyUser(null)` calls `posthog.reset()`, which mints a fresh anonymous id
 * so one person's distinct_id cannot follow a shared device — a family laptop, a
 * center's front-desk machine — into the next person's session. That reset is
 * correct exactly once: when somebody has actually left.
 *
 * So this component is mounted ONLY where a session is known to exist, and never
 * renders with a null. A page that does not know who you are stays quiet rather
 * than resetting, because resetting on every public page load would regenerate
 * the anonymous id constantly and fragment every funnel it touches.
 *
 * The sign-out half lives at `/[locale]/login`, which is where leaving lands
 * you. See the note there.
 */
export function AnalyticsIdentity({ session }: { session: SessionLike }) {
  useEffect(() => {
    identifyUser(session);
    // Re-identify when the ACTOR changes, not on every render of a new object.
  }, [session.id, session.role, session.centerId]);

  return null;
}
