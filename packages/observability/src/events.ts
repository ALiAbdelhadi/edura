export const ANALYTICS_EVENTS = {
  LANDING_CTA_CLICKED: "landing_cta_clicked",
  SIGNUP_COMPLETED: "signup_completed",
  FIRST_TEACHER_ADDED: "first_teacher_added",
  FIRST_GROUP_CREATED: "first_group_created",
  FIRST_STUDENT_ADDED: "first_student_added",
  FIRST_PAYMENT_COMPLETED: "first_payment_completed",

  DEMO_REQUESTED: "demo_requested",
  CONTACT_SUBMITTED: "contact_submitted",
  CONTACT_FAILED: "contact_failed",
  HELP_ARTICLE_VIEWED: "help_article_viewed",
  FAQ_OPENED: "faq_opened",
  CHECKLIST_VIEWED: "onboarding_checklist_viewed",
  CHECKLIST_STEP_CLICKED: "onboarding_checklist_step_clicked",
  CHECKLIST_DISMISSED: "onboarding_checklist_dismissed",
  EMPTY_STATE_CTA_CLICKED: "empty_state_cta_clicked",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export const ALLOWED_PROPERTIES = new Set([
  "role",
  "center_id",
  "cta",
  "surface",
  "locale",
  "signup_role",
  "payment_method",
  "plan",
  "amount_piasters",
  "currency",
  "slug",
  "question",
  "category",
  "step",
  "list",
  "done",
  "total",
  "subject",
  "status",
]);

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function sanitizeProperties(props: AnalyticsProperties | undefined): AnalyticsProperties {
  if (!props) return {};
  const out: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(props)) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

export function posthogKey(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
}

export function posthogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
}

export function isAnalyticsEnabled(): boolean {
  return posthogKey().length > 0;
}
