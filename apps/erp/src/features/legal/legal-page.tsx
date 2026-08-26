import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

export function LegalPage({
  locale,
  title,
  updated,
  children,
}: {
  locale: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const ar = locale === "ar";
  return (
    <div className="min-h-screen bg-(--paper)">
      <header className="border-b border-(--rule) bg-(--sheet)">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/edura-mark.svg" alt="" width={28} height={28} />
            <span className="text-lg font-bold text-(--ink)">Edura</span>
          </Link>
          <Link href="/" className="text-sm text-(--indigo) hover:underline">
            {ar ? "العودة للرئيسية" : "Back to home"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold text-(--ink)">{title}</h1>
        <p className="mt-2 text-sm text-(--ink-3)">
          {ar ? "آخر تحديث: " : "Last updated: "}
          {updated}
        </p>
        <div className="legal-prose mt-8 space-y-6 rounded-(--radius) border border-(--rule) bg-(--sheet) p-6 sm:p-8 [&_h2]:border-b [&_h2]:border-(--rule-2) [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-(--ink) [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-(--ink) [&_li]:text-sm [&_li]:leading-7 [&_li]:text-(--ink-2) [&_p]:text-sm [&_p]:leading-7 [&_p]:text-(--ink-2) [&_ul]:ms-5 [&_ul]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-3xl px-6 pb-10 text-center text-xs text-(--ink-3)">
        © {new Date().getFullYear()} Edura
      </footer>
    </div>
  );
}
