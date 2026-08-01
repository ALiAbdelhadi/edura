"use client";

import { LedgerButton } from "@/components/ledger";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Link } from "@/i18n/navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { Suspense, useState } from "react";

export function LandingHeader({
  loginLabel,
  registerLabel,
}: {
  loginLabel: string;
  registerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}
    >
      <div className="mx-auto flex w-full max-w-352 items-center justify-between gap-3 px-4 py-3 sm:px-8 md:px-12 lg:px-16">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Image src="/edura-mark.svg" alt="" width={28} height={28} priority className="shrink-0" />
          <span className="truncate text-lg font-bold sm:text-xl" style={{ color: "var(--ink)" }}>
            Edura
          </span>
        </Link>
        <nav className="hidden items-center gap-2 sm:flex">
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <LedgerButton asChild variant="secondary" className="hidden md:inline-flex">
            <Link href="/login">{loginLabel}</Link>
          </LedgerButton>
          <LedgerButton asChild variant="primary">
            <Link href="/register">{registerLabel}</Link>
          </LedgerButton>
        </nav>
        <div className="flex items-center gap-1 sm:hidden">
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-lg border transition-colors"
                style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
                aria-label="Menu"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              showCloseButton={false}
              className="flex w-[min(100vw-2rem,20rem)] flex-col gap-0 p-0"
              style={{ background: "var(--sheet)", borderColor: "var(--rule)" }}
            >
              <SheetHeader className="border-b px-5 py-4 text-start" style={{ borderColor: "var(--rule)" }}>
                <div className="flex items-center justify-between gap-3">
                  <SheetTitle className="text-base font-bold" style={{ color: "var(--ink)" }}>
                    Edura
                  </SheetTitle>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="inline-flex size-10 items-center justify-center rounded-md"
                      style={{ color: "var(--ink-2)" }}
                      aria-label="Close"
                    >
                      <X className="size-6" />
                    </button>
                  </SheetClose>
                </div>
              </SheetHeader>
              <nav className="flex flex-col gap-2 p-5">
                <LedgerButton asChild variant="primary" className="w-full justify-center py-2.5">
                  <Link href="/register" onClick={() => setOpen(false)}>
                    {registerLabel}
                  </Link>
                </LedgerButton>
                <LedgerButton asChild variant="secondary" className="w-full justify-center py-2.5">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    {loginLabel}
                  </Link>
                </LedgerButton>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
