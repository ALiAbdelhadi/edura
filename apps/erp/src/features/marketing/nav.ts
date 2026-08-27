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
  inHeader?: boolean;
  footerColumn?: "product" | "resources" | "company";
  inSitemap?: boolean;
};

export const MARKETING_LINKS: readonly MarketingLink[] = [
  {
    href: "/pricing",
    labelKey: "pricing",
    inHeader: true,
    footerColumn: "product",
    inSitemap: true,
  },
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
