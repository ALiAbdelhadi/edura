import type { ReactNode } from "react";
import { LandingShell } from "../landing/landing-shell";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";

export function MarketingShell({
  active,
  children,
}: {
  active?: string;
  children: ReactNode;
}) {
  return (
    <LandingShell>
      <MarketingHeader active={active} />
      <main>{children}</main>
      <MarketingFooter />
    </LandingShell>
  );
}
