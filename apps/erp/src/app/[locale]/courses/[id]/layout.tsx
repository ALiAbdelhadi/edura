import { RefineProvider } from "@/components/providers/refine-provider";
import type { ReactNode } from "react";

// This page calls Refine hooks but sits outside /dashboard, where the provider
// is mounted. Refine is scoped per-area so the other 28 public routes do not
// ship it — see components/providers/refine-provider.tsx.
export default function Layout({ children }: { children: ReactNode }) {
  return <RefineProvider>{children}</RefineProvider>;
}
