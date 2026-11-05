import { WALLET_ENABLED } from "@/lib/config/features";

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

const WALLET_ARTICLES = new Set(["teacher-wallet-payouts", "student-wallet"]);

const ALL_HELP_ARTICLES: readonly HelpArticle[] = [
  { slug: "create-center-account", category: "start" },
  { slug: "invite-teacher", category: "start" },
  { slug: "create-group", category: "start" },
  { slug: "teacher-attendance-close", category: "attendance" },
  { slug: "counter-checkin", category: "attendance" },
  { slug: "door-checkin", category: "attendance" },
  { slug: "offline-attendance", category: "attendance" },
  { slug: "record-cash-payment", category: "money" },
  { slug: "close-session-settlement", category: "money" },
  { slug: "request-payout", category: "money" },
  { slug: "teacher-wallet-payouts", category: "money" },
  { slug: "assistant-accounts", category: "people" },
  { slug: "assistant-first-steps", category: "people" },
  { slug: "guardian-email-messaging", category: "safety" },

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
];

export const HELP_ARTICLES: readonly HelpArticle[] = ALL_HELP_ARTICLES.filter(
  (a) => WALLET_ENABLED || !WALLET_ARTICLES.has(a.slug),
);

export function articlesInCategory(category: HelpCategory) {
  return HELP_ARTICLES.filter((a) => a.category === category);
}

export function findArticle(slug: string) {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}
