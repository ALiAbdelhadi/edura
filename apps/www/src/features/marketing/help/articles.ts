/**
 * The help-centre index.
 *
 * Slugs and categories only — every word a reader sees lives in the article's
 * own `.mdx` file (title and summary in its frontmatter). `app/sitemap.ts`
 * reads this list, so adding a row here plus the two `.mdx` files is the whole
 * act of publishing an article; there is no third place to remember.
 *
 * `category` keys resolve against `marketing.help.categories.*`.
 */

export const HELP_CATEGORIES = ["start", "attendance", "money", "people", "safety"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
};

export const HELP_ARTICLES: readonly HelpArticle[] = [
  // البداية
  { slug: "create-center-account", category: "start" },
  { slug: "invite-teacher", category: "start" },
  { slug: "create-group", category: "start" },
  // الحضور
  { slug: "counter-checkin", category: "attendance" },
  { slug: "door-checkin", category: "attendance" },
  { slug: "offline-attendance", category: "attendance" },
  // الفلوس
  { slug: "record-cash-payment", category: "money" },
  { slug: "close-session-settlement", category: "money" },
  { slug: "request-payout", category: "money" },
  // الناس والصلاحيات
  { slug: "assistant-accounts", category: "people" },
  // الأمان
  { slug: "guardian-email-messaging", category: "safety" },
] as const;

export function articlesInCategory(category: HelpCategory) {
  return HELP_ARTICLES.filter((a) => a.category === category);
}

export function findArticle(slug: string) {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}
