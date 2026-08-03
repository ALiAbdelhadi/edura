import type { AbstractIntlMessages } from "next-intl";
import en from "@/messages/en.json";

/**
 * Route-scoped message subsets.
 *
 * `NextIntlClientProvider` with no `messages` prop serializes the ENTIRE merged
 * dictionary into every page's RSC payload — 72KB (en) / 94KB (ar) for www, on
 * every page including the unauthenticated login screen, which was shipping the
 * admin, teacher, parent and student dictionaries to visitors who cannot reach
 * any of those screens.
 *
 * These helpers pick a top-level subset instead. They operate on the ALREADY
 * resolved messages from `getMessages()`, so the ar→en fallback merge in
 * i18n/request.ts still applies exactly as before — this only decides which
 * top-level namespaces cross the wire, never how one is resolved.
 *
 * BASE_KEYS is derived from en.json's own keys rather than hardcoded, so adding
 * a namespace to en.json ships it everywhere automatically. That is deliberate:
 * en.json holds the app-wide chrome (nav, actions, auth, common, roles, status,
 * theme, metadata) plus the public-page blocks, and it is also where every
 * DYNAMICALLY built key lives — `t("roles." + role)`, `t("status." + s)`,
 * `theme.*` — which static analysis cannot see. Keeping all of en.json in the
 * base is what makes those safe.
 */
/**
 * `shared` is added explicitly because it is NOT a top-level key of en.json —
 * it is its own namespace file — and `app/[locale]/error.tsx` is a GLOBAL error
 * boundary that calls `useTranslations("shared")`.
 *
 * Without it, the boundary rendered the raw key paths: a user who hit an error
 * on any route with a narrower scope saw a page reading "shared.errorTitle /
 * shared.errorBody / shared.errorRetry". The worst possible moment to lose the
 * copy, and invisible in normal use because it only appears once something has
 * already failed. Found by the showcase capture pipeline, which screenshotted
 * it on /dashboard/student/wallet.
 *
 * Any namespace used by a component that can render on EVERY route belongs
 * here for the same reason.
 */
const BASE_KEYS = [...Object.keys(en), "shared"] as ReadonlyArray<string>;

function pick(
  messages: AbstractIntlMessages,
  keys: ReadonlyArray<string>,
): AbstractIntlMessages {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in messages) out[key] = (messages as Record<string, unknown>)[key];
  }
  return out as AbstractIntlMessages;
}

/**
 * Public / unauthenticated routes: login, register, password reset, the walk-in
 * claim landing, invite acceptance, and the public center/course pages. Verified
 * to need nothing beyond en.json.
 */
export function baseMessages(messages: AbstractIntlMessages) {
  return pick(messages, BASE_KEYS);
}

/** The onboarding wizard — base plus its own namespace. */
export function onboardingMessages(messages: AbstractIntlMessages) {
  return pick(messages, [...BASE_KEYS, "onboarding"]);
}
