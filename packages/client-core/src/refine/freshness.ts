// How long a query may answer from cache before React Query re-asks the server.
//
// The global client (`query-client.ts`) deliberately keeps React Query's own
// defaults — `staleTime: 0`, `refetchOnMount`, `refetchOnWindowFocus` — so the
// SAFEST behaviour is what a new screen inherits when its author writes nothing.
// Money, wallet balances, subscriptions, attendance, messaging and notifications
// must never answer from a stale cache (CLAUDE.md, binding), and they get that by
// having no opt-in at all rather than by remembering to opt out.
//
// These presets are the opt-in, and each one is a claim about the DATA, not about
// the screen: how long may this be wrong by, and does a window regaining focus
// mean anything for it. `refetchOnWindowFocus` is false in every preset here
// because alt-tabbing back is a fact about the person, not about the data.
//
// An explicit `query.refetch()` after a mutation ignores `staleTime` entirely, so
// a screen that refreshes itself after an action keeps doing so unchanged.
export const QUERY_FRESHNESS = {
  // Permanent reference data — the Egyptian education catalog. It changes a few
  // times a year, and the server already serves it from a 300s cache.
  reference: { staleTime: 5 * 60_000, refetchOnWindowFocus: false },

  // Public discovery: search listings and public profiles. A minute behind is
  // invisible to a browsing reader, and these are the highest-volume anonymous
  // reads in the product.
  discovery: { staleTime: 60_000, refetchOnWindowFocus: false },

  // Ordinary authenticated lists — rosters, materials, notes. Not money, not
  // attendance. Short enough that a second person's edit shows up while you are
  // still looking at the screen.
  list: { staleTime: 30_000, refetchOnWindowFocus: false },
} as const;
