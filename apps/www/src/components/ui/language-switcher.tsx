"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "English",
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const nextLocale = next as (typeof routing.locales)[number];
    if (!nextLocale || nextLocale === locale) return;
    const qs = searchParams.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      router.replace(href, { locale: nextLocale });
    });
  }

  return (
    <ToggleGroup
      type="single"
      size="default"
      variant="default"
      spacing={1}
      value={locale}
      disabled={isPending}
      onValueChange={handleChange}
      aria-label={t("common.language")}
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
