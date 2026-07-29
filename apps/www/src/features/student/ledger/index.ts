/**
 * Re-export shim.
 *
 * The Ledger layer was promoted to `@/components/ledger` when the auth pages
 * (login, register, password reset) needed it — those are shared routes, not
 * student ones, so importing them out of `features/student` would have been a
 * portal reaching across into another portal's folder.
 *
 * This shim keeps every existing student import path working unchanged, which
 * is the same "promote with a re-export, change no call site" rule the
 * foundation brief sets for packages/ui promotions.
 */
export * from "@/components/ledger";
