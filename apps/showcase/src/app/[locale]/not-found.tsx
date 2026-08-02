import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("nav");
  return (
    <main
      id="content"
      className="grid min-h-svh place-items-center px-6 text-center"
    >
      <div>
        <p className="font-mono text-sm" style={{ color: "var(--ink-3)" }}>
          404
        </p>
        <Link
          href="/"
          className="focus-ledger mt-4 inline-block underline"
          style={{ color: "var(--indigo)" }}
        >
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
