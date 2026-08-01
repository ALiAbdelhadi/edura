"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./auth";

/**
 * THE client-side auth surface (replaces next-auth/react). Import from here —
 * never call fetch("/api/auth/...") by hand.
 *
 *   authClient.signIn.email({ email, password })  — typed errors via
 *     error.message: USER_NOT_FOUND | ACCOUNT_INACTIVE | RATE_LIMITED
 *   authClient.signOut()
 *   authClient.getSession() / authClient.useSession()
 *   authClient.listSessions() / revokeSession({ token }) / revokeOtherSessions()
 *   authClient.twoFactor.* (TOTP enroll/verify — guided, optional on www)
 *   authClient.$fetch("/invite-token/claim", ...) — the Step 7 claim door
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields<Auth>(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Password was correct but the account has TOTP enabled: hand off to
        // the second-factor screen (locale prefix is handled by the router).
        window.location.href = "/two-factor";
      },
    }),
  ],
});

export type AuthSessionData = typeof authClient.$Infer.Session;
