"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./auth";

/**
 * THE client-side auth surface for the back office (replaces next-auth/react).
 * 2FA is REQUIRED for super_admin/accountant — the dashboard layout gates on
 * twoFactorEnabled and routes to /two-factor-setup until enrollment is done.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields<Auth>(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    adminClient(),
  ],
});

export type AuthSessionData = typeof authClient.$Infer.Session;
