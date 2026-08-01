// SHIM. The funnel helpers moved to @repo/server-core/services/analytics so the
// money paths that live in the kernel (wallet-paid subscriptions, cash at the
// counter) can report the same events as the route handlers here — otherwise
// two of the four payment rails would be invisible to the funnel.
//
// Same pattern as the receipt-email and password-reset kernel moves: every
// import path in apps/www is unchanged.
export * from "@repo/server-core/services/analytics/funnel";
