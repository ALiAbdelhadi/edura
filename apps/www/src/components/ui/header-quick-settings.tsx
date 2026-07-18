"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Globe, Sun, Moon, Monitor, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Button } from "@repo/ui/components/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  useThemeMode,
  type ThemeMode,
} from "@/components/providers/theme-mode-provider";

const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "English",
};

export function HeaderQuickSettings() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { mode, setMode } = useThemeMode();

  function handleLocaleChange(next: string) {
    const nextLocale = next as (typeof routing.locales)[number];
    if (!nextLocale || nextLocale === locale) return;
    const qs = searchParams.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      router.replace(href, { locale: nextLocale });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("shared.quickSettings")}
          disabled={isPending}
        >
          <Settings2 className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("shared.settingsLanguage")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={handleLocaleChange}
        >
          {routing.locales.map((l) => (
            <DropdownMenuRadioItem key={l} value={l}>
              <Globe className="size-4" />
              {LOCALE_LABELS[l] ?? l}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(v) => v && setMode(v as ThemeMode)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" />
            {t("theme.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" />
            {t("theme.dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" />
            {t("theme.system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
