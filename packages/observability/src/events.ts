// =============================================================================
// The product funnel, declared once.
//
//   landing CTA -> signup -> first teacher / group / student -> first payment
//
// Event names are a CLOSED SET. PostHog will happily accept `signup_completed`,
// `signup-completed` and `signupCompleted` as three unrelated events and split
// the funnel three ways with no error anywhere — the failure mode is a chart
// that is quietly wrong, which is worse than one that is obviously broken.
// =============================================================================

export const ANALYTICS_EVENTS = {
  /** Step 1 — a visitor clicked a call to action on a marketing page. */
  LANDING_CTA_CLICKED: "landing_cta_clicked",
  /** Step 2 — an account was created (any role). */
  SIGNUP_COMPLETED: "signup_completed",
  /** Step 3 — the account did the thing that makes the product useful. */
  FIRST_TEACHER_ADDED: "first_teacher_added",
  FIRST_GROUP_CREATED: "first_group_created",
  FIRST_STUDENT_ADDED: "first_student_added",
  /** Step 4 — money moved for the first time. */
  FIRST_PAYMENT_COMPLETED: "first_payment_completed",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Properties an event may carry, by name.
 *
 * An ALLOWLIST, not a type. Anything not named here is dropped by
 * `sanitizeProperties` before it reaches PostHog, so adding a property is a
 * deliberate act and a careless `{ ...user }` spread cannot leak a name or an
 * email into an analytics warehouse.
 *
 * Every value is an id, an enum, or a number. No free text.
 */
export const ALLOWED_PROPERTIES = new Set([
  // Identity-shaped, already filtered by observabilityIdentity().
  "role",
  "center_id",
  // Where a CTA was.
  "cta",
  "surface",
  "locale",
  // What kind of thing happened.
  "signup_role",
  "payment_method",
  "plan",
  // Money, in piasters. An integer, never a formatted string.
  "amount_piasters",
  "currency",
]);

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

/**
 * Drop anything not on the allowlist. Returns a NEW object — the caller's is
 * never mutated, because callers pass literals built from live records.
 */
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

/**
 * Disabled unless a key is set. Same posture as Sentry: local development and
 * CI send nothing without anyone remembering to switch it off.
 */
export function isAnalyticsEnabled(): boolean {
  return posthogKey().length > 0;
}
