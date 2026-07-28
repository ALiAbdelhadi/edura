/**
 * Idempotency keys for student-initiated payment intents.
 *
 * Lives at module scope on purpose. `Date.now()` and `Math.random()` called
 * lexically inside a component body trip `react-hooks/purity`, because the
 * linter cannot prove the call only happens inside an event handler. Hoisting
 * it here keeps the behaviour identical and the rule satisfied.
 *
 * CAVEAT, deliberately preserved rather than silently changed: a fresh key is
 * minted per attempt, so a user retrying a failed checkout gets a NEW key and
 * the server treats it as a new intent. That is the existing behaviour of both
 * the wallet top-up and the subscription checkout. Making a retry reuse its
 * key changes payment semantics and belongs with the money owner, not with a
 * design pass.
 */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
