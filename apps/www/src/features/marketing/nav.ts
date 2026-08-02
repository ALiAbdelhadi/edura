/**
 * The public (signed-out) surface, in ONE place.
 *
 * The header, the mobile sheet, the footer and `app/sitemap.ts` all read this
 * table. Adding a marketing page is a row here plus its route — a page can no
 * longer exist while being unreachable from the chrome or invisible to search,
 * which is exactly how /terms and /privacy used to drift.
 *
 * `labelKey` is a key under the `marketing.nav` namespace; nothing here holds
 * user-visible copy, so ar/en parity is enforced by the message files.
 */

/**
 * A literal union rather than `string`: next-intl types `t()` against the
 * message tree, so a typo'd key is a COMPILE error instead of a raw
 * "marketing.nav.pricng" rendered on the page.
 */
export type MarketingNavKey =
  | "home"
  | "pricing"
  | "help"
  | "faq"
  | "changelog"
  | "contact"
  | "terms"
  | "privacy";

export type MarketingLink = {
  href: string;
  labelKey: MarketingNavKey;
  /** Shown in the top navigation bar (desktop) and the mobile sheet. */
  inHeader?: boolean;
  /** Which footer column it belongs to. */
  footerColumn?: "product" | "resources" | "company";
  /** Included in app/sitemap.ts. */
  inSitemap?: boolean;
};

export const MARKETING_LINKS: readonly MarketingLink[] = [
  // ── Product ───────────────────────────────────────────────────────────────
  { href: "", labelKey: "home", footerColumn: "product", inSitemap: true },
  {
    href: "/pricing",
    labelKey: "pricing",
    inHeader: true,
    footerColumn: "product",
    inSitemap: true,
  },
  // ── Resources ─────────────────────────────────────────────────────────────
  {
    href: "/help",
    labelKey: "help",
    inHeader: true,
    footerColumn: "resources",
    inSitemap: true,
  },
  {
    href: "/faq",
    labelKey: "faq",
    inHeader: true,
    footerColumn: "resources",
    inSitemap: true,
  },
  {
    href: "/changelog",
    labelKey: "changelog",
    footerColumn: "resources",
    inSitemap: true,
  },
  // ── Company ───────────────────────────────────────────────────────────────
  {
    href: "/contact",
    labelKey: "contact",
    inHeader: true,
    footerColumn: "company",
    inSitemap: true,
  },
  { href: "/terms", labelKey: "terms", footerColumn: "company", inSitemap: true },
  { href: "/privacy", labelKey: "privacy", footerColumn: "company", inSitemap: true },
] as const;

export const HEADER_LINKS = MARKETING_LINKS.filter((l) => l.inHeader);

export function footerColumn(name: NonNullable<MarketingLink["footerColumn"]>) {
  return MARKETING_LINKS.filter((l) => l.footerColumn === name);
}

/**
 * The Calendly (or any scheduling tool) URL for «احجز عرضًا».
 *
 * Read through `NEXT_PUBLIC_` so the client bundle can inline it. Returns null
 * when unset, and every consumer HIDES the CTA rather than rendering a dead
 * button — an unconfigured deployment must not ship a link to nowhere.
 *
 * The value is validated as an absolute http(s) URL: this string is placed in
 * an `href`, so a malformed or `javascript:` value must never reach the DOM.
 */
export function demoBookingUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_CALENDLY_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
