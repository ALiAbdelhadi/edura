import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

/**
 * Shared shell for the legal pages (terms / privacy). Server-rendered prose in
 * the Ledger look: paper background, one sheet, rule separators. The content
 * itself is inline TSX per locale — long legal text does not belong in the
 * i18n JSON (it is a document, not UI strings).
 */
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
    <div className="min-h-screen bg-[var(--paper)]">
      <header className="border-b border-[var(--rule)] bg-[var(--sheet)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* A bare <img>: next/image REFUSES SVG unless the optimizer is
                opened to it, so this rendered as a broken image. `alt=""`, not
                "Edura" — the wordmark is rendered beside it, so the mark is
                decorative and alt text there is announced twice. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/edura-mark.svg" alt="" width={28} height={28} />
            <span className="text-lg font-bold text-[var(--ink)]">Edura</span>
          </Link>
          <Link href="/" className="text-sm text-[var(--indigo)] hover:underline">
            {ar ? "العودة للرئيسية" : "Back to home"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold text-[var(--ink)]">{title}</h1>
        <p className="mt-2 text-sm text-[var(--ink-3)]">
          {ar ? "آخر تحديث: " : "Last updated: "}
          {updated}
        </p>
        {/* `h3` was added for the data-rights section, which has genuine
            sub-headings (access / deletion / correction). Rule-less and
            smaller than h2 so the hierarchy stays two levels deep visually. */}
        <div className="legal-prose mt-8 space-y-6 rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--sheet)] p-6 sm:p-8 [&_h2]:border-b [&_h2]:border-[var(--rule-2)] [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--ink)] [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[var(--ink)] [&_li]:text-sm [&_li]:leading-7 [&_li]:text-[var(--ink-2)] [&_p]:text-sm [&_p]:leading-7 [&_p]:text-[var(--ink-2)] [&_ul]:ms-5 [&_ul]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-3xl px-6 pb-10 text-center text-xs text-[var(--ink-3)]">
        © {new Date().getFullYear()} Edura
      </footer>
    </div>
  );
}
