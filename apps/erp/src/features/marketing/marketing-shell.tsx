import type { ReactNode } from "react";
import { LandingShell } from "../landing/landing-shell";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";

/**
 * Chrome for every signed-out page: the Ledger paper canvas, the shared header
 * and the shared footer. A marketing page renders its sections and nothing
 * else — the header/footer are not each page's problem, which is what keeps
 * them identical across the site.
 *
 * `active` is the nav href of the current page (e.g. "/pricing").
 */
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
