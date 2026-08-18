import { Link } from "@/i18n/navigation";
import { Button } from "@repo/ui/components/button";
import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("errorPage");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-(--paper) px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-(--indigo-soft) text-(--indigo)">
        <SearchX className="size-7" />
      </div>
      <h1 className="text-2xl font-bold text-(--ink)">{t("notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-(--ink-2)">{t("notFoundBody")}</p>
      <Button asChild className="mt-2">
        <Link href="/">{t("notFoundHome")}</Link>
      </Button>
    </div>
  );
}
