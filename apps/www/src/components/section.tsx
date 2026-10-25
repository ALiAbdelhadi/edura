import type { ReactNode } from "react";

import type { Locale } from "@/i18n/config";

// Formerly the highlighter stroke. The highlight is retired; this stays a plain
// inline span so existing callers keep rendering. Do not use it for new copy.
export function Mark({ children }: { children: ReactNode }) {
  return <span>{children}</span>;
}

/*
 * A page section. Sections are separated by a 1px rule on the container, like
 * the lines of a board, not by alternating backgrounds.
 *   tone "paper" (default) — the page ground.
 *   tone "sheet" — kept for existing callers; renders as "paper" now.
 *   tone "band"  — the one board-green section a page may have (no rule).
 *   rule={false} — drops the top rule (e.g. the first section under a hero).
 */
export function Section({
  id,
  children,
  tone = "paper",
  rule = true,
  className,
}: {
  id: string;
  locale?: Locale;
  children: ReactNode;
  tone?: "paper" | "sheet" | "band";
  rule?: boolean;
  className?: string;
}) {
  const band = tone === "band";
  return (
    <section id={id} className={[band ? "band" : undefined, className].filter(Boolean).join(" ") || undefined}>
      <div className="wrap">
        <div className={`min-w-0 py-16 md:py-24 ${rule && !band ? "border-t border-rule" : ""}`}>
          {children}
        </div>
      </div>
    </section>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="t-h2">
      {children}
    </h2>
  );
}

export function SectionBody({ children }: { children: ReactNode }) {
  return <p className="section-body t-lede mt-5">{children}</p>;
}
