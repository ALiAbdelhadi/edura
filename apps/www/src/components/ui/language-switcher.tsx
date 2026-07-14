"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "English",
};

/**
 * Locale toggle (Phase 6). Switches the active locale while preserving the
 * current path AND query string, using next-intl's locale-aware router. The
 * middleware persists the choice in the NEXT_LOCALE cookie on navigation.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname(); // path WITHOUT the locale prefix
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const nextLocale = next as (typeof routing.locales)[number];
    // ToggleGroup emits "" on deselect; ignore it and same-locale clicks.
    if (!nextLocale || nextLocale === locale) return;
    const qs = searchParams.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      // `locale` option swaps only the prefix; path + query are preserved.
      router.replace(href, { locale: nextLocale });
    });
  }

  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={locale}
      disabled={isPending}
      onValueChange={handleChange}
      aria-label="Language"
    >
      {routing.locales.map((l) => (
        <ToggleGroupItem key={l} value={l} aria-label={LOCALE_LABELS[l] ?? l}>
          <Globe className="me-1.5 size-4" />
          {LOCALE_LABELS[l] ?? l}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
