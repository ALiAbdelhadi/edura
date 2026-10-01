/**
 * Whether a back-office session has cleared the 2FA requirement.
 *
 * Kept as a pure function so the rule is testable on its own and so the API layer
 * and the dashboard layout cannot drift apart: before this, the ONLY enforcement was
 * a redirect in the layout, which guards the browser and nothing else — a
 * password-only session still reached every /api/v1 route with curl.
 */
export function twoFactorSatisfied(session: {
  twoFactorEnabled?: unknown;
  impersonatedBy?: unknown;
}): boolean {
  // An impersonated session is a back-office actor acting AS someone else. They
  // cleared their own 2FA to mint it, and the target may have none of their own.
  if (session.impersonatedBy) return true;

  // Fails closed on purpose. Only an explicit `true` passes, so if the field ever
  // stops being delivered — an undeclared better-auth field is dropped from
  // getSession() silently — this refuses instead of waving everyone through.
  return session.twoFactorEnabled === true;
}
