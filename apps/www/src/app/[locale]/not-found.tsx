import { Link } from "@/i18n/navigation";
import { Button } from "@repo/ui/components/button";
import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  // This file is a SERVER component, so unlike error.tsx it was never broken:
  // `useTranslations` resolves from i18n/request.ts, which returns the whole
  // merged dictionary, not from the client provider's `baseMessages()` subset.
  // It reads `errorPage` anyway so that both boundaries share one namespace —
  // and so the day this gains "use client" is not the day someone rediscovers
  // the bug error.tsx had.
  const t = useTranslations("errorPage");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--paper)] px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[var(--indigo-soft)] text-[var(--indigo)]">
        <SearchX className="size-7" />
      </div>
      <h1 className="text-2xl font-bold text-[var(--ink)]">{t("notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-[var(--ink-2)]">{t("notFoundBody")}</p>
      <Button asChild className="mt-2">
        <Link href="/">{t("notFoundHome")}</Link>
      </Button>
    </div>
  );
}
