"use client";

import { LedgerButton } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { track } from "@/lib/track";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { DemoCta } from "./demo-cta";

/**
 * The mobile navigation sheet — the ONLY client island in the marketing
 * chrome. Every string arrives resolved from the server so the `marketing`
 * dictionary never crosses the wire (see lib/i18n/scope.ts: only en.json's own
 * top-level namespaces are shipped to the client, and this one is deliberately
 * not among them).
 */
export function MarketingMobileNav({
  links,
  loginLabel,
  registerLabel,
  demoLabel,
  demoUrl,
  menuLabel,
  closeLabel,
}: {
  links: readonly { href: string; label: string }[];
  loginLabel: string;
  registerLabel: string;
  demoLabel: string;
  demoUrl: string | null;
  menuLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
          aria-label={menuLabel}
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-[min(100vw-2rem,20rem)] flex-col gap-0 overflow-y-auto p-0"
        style={{ background: "var(--sheet)", borderColor: "var(--rule)" }}
      >
        <SheetHeader
          className="border-b px-5 py-4 text-start"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base font-bold" style={{ color: "var(--ink)" }}>
              Edura
            </SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-md"
                style={{ color: "var(--ink-2)" }}
                aria-label={closeLabel}
              >
                <X className="size-6" />
              </button>
            </SheetClose>
          </div>
        </SheetHeader>

        <nav className="flex flex-col p-5">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-2.5 text-[15px] font-medium transition-colors hover:bg-(--field)"
                  style={{ color: "var(--ink)" }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col gap-2 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
            <DemoCta
              url={demoUrl}
              label={demoLabel}
              placement="mobile_nav"
              variant="secondary"
              className="w-full justify-center py-2.5"
              withIcon
            />
            <LedgerButton asChild variant="primary" className="w-full justify-center py-2.5">
              <Link
                href="/register"
                onClick={() => {
                  track("cta_clicked", { cta: "register", placement: "mobile_nav" });
                  setOpen(false);
                }}
              >
                {registerLabel}
              </Link>
            </LedgerButton>
            <LedgerButton asChild variant="secondary" className="w-full justify-center py-2.5">
              <Link href="/login" onClick={() => setOpen(false)}>
                {loginLabel}
              </Link>
            </LedgerButton>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
