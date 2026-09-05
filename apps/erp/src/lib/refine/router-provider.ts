"use client";

import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { createAppRouterProvider } from "@repo/client-core/refine/router-provider";

// Bound once at module scope, per createAppRouterProvider's contract.
export const useAppRouterProvider = createAppRouterProvider({
  Link,
  useRouter,
  usePathname,
});
