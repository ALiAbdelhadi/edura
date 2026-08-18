import { ROLE_SLUGS } from "@/i18n/roles";

/**
 * EVERY PUBLIC PATH OF THIS SITE, IN ONE TABLE.
 *
 * The header nav, the footer and the sitemap all read from here, so a page
 * cannot exist in one and be missing from another. That invariant is not a
 * nicety: a route the sitemap forgets is a route a search engine never sees,
 * and it fails silently — nothing 404s, nothing errors, the page simply does
 * not exist as far as the outside world is concerned. `tools/verify.ts`
 * asserts that every href rendered in the chrome appears in the sitemap.
 *
 * Paths are LOCALE-RELATIVE (`/pricing`, not `/ar/pricing`); the locale is
 * prefixed by whoever renders or emits them.
 */

/** The marketing pages that earn a place in the header nav. */
export const NAV_PATHS = ["pricing", "faq", "trust"] as const;
export type NavPath = (typeof NAV_PATHS)[number];

/**
 * Legal pages: FOOTER ONLY, deliberately.
 *
 * They are reference material a reader goes looking for, not part of the
 * argument the site is making, and a header that offers "Terms" beside
 * "Pricing" spends its most valuable row on the least-read page on the site.
 * The footer carries them on every page, which is where a reader looks.
 */
export const LEGAL_PATHS = ["privacy", "terms"] as const;
export type LegalPath = (typeof LEGAL_PATHS)[number];

export function isNavPath(value: string): value is NavPath {
  return (NAV_PATHS as readonly string[]).includes(value);
}

type PublicRoute = {
  /** Locale-relative path. The landing is `""`. */
  path: string;
  /** Sitemap priority — the landing leads, legal trails. */
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
};

/** Every indexable route, in the order a crawler should meet them. */
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  ...ROLE_SLUGS.map((role) => ({
    path: `/for/${role}`,
    priority: 0.8,
    changeFrequency: "monthly" as const,
  })),
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/trust", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  // Legal is indexable but never competes: it is the page a reader arrives at
  // on purpose, never the one a search should surface for "teaching center
  // software".
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];
