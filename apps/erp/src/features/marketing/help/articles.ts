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

export const HELP_CATEGORIES = [
  "start",
  "student",
  "attendance",
  "money",
  "people",
  "safety",
] as const;
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
  { slug: "teacher-attendance-close", category: "attendance" },
  { slug: "counter-checkin", category: "attendance" },
  { slug: "door-checkin", category: "attendance" },
  { slug: "offline-attendance", category: "attendance" },
  // الفلوس
  { slug: "record-cash-payment", category: "money" },
  { slug: "close-session-settlement", category: "money" },
  { slug: "request-payout", category: "money" },
  { slug: "teacher-wallet-payouts", category: "money" },
  // الناس والصلاحيات
  { slug: "assistant-accounts", category: "people" },
  // The assistant's own guide. Filed under `people` rather than a new category:
  // it is one article, and the category list is a top-level menu, not a tag.
  { slug: "assistant-first-steps", category: "people" },
  // الأمان
  { slug: "guardian-email-messaging", category: "safety" },

  // ── دليل الطالب ────────────────────────────────────────────────────────────
  // Ordered to read as one continuous guide: the three entry paths first, then
  // the thirteen portal screens in the order a student meets them, then the
  // two reference articles. `student-troubleshooting` links back into all of it.
  { slug: "student-first-steps", category: "student" },
  { slug: "student-onboarding-track", category: "student" },
  { slug: "student-claim-invite", category: "student" },
  { slug: "student-how-to", category: "student" },
  { slug: "student-home-and-schedule", category: "student" },
  { slug: "student-subjects-and-subscribe", category: "student" },
  { slug: "student-wallet", category: "student" },
  { slug: "student-subscriptions", category: "student" },
  { slug: "student-receipts", category: "student" },
  { slug: "student-id-card", category: "student" },
  { slug: "student-attendance", category: "student" },
  { slug: "student-grades", category: "student" },
  { slug: "student-materials", category: "student" },
  { slug: "student-reviews", category: "student" },
  { slug: "student-family", category: "student" },
  { slug: "student-messages", category: "student" },
  { slug: "student-notifications", category: "student" },
  { slug: "student-settings-security", category: "student" },
  { slug: "student-troubleshooting", category: "student" },
  { slug: "student-glossary", category: "student" },
] as const;

export function articlesInCategory(category: HelpCategory) {
  return HELP_ARTICLES.filter((a) => a.category === category);
}

export function findArticle(slug: string) {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}
