"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./auth";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    inferAdditionalFields<Auth>(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
  ],
});

export type AuthSessionData = typeof authClient.$Infer.Session;
