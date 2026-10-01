"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { AdminAuth } from "@repo/server-core/backoffice-auth/create-auth";

// The server instance now lives in apps/admin-api; only its TYPE is imported
// here so the client infers the same additional fields (lint allows type
// imports of server packages, never values).
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields<AdminAuth>(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    adminClient(),
  ],
});

export type AuthSessionData = typeof authClient.$Infer.Session;
