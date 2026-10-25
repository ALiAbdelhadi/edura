import type { Locale } from "@/i18n/config";

/*
 * The Linktich mark: a 3x3 week, the middle class filled. On paper the base cells
 * are ink and the filled one is the board green; on the board (variant "board")
 * the base cells are chalk and the filled one is chalk yellow.
 */
const CELLS = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));

export function Mark({
  className = "",
  variant = "paper",
}: {
  className?: string;
  variant?: "paper" | "board";
}) {
  const base = variant === "board" ? "var(--on-pen)" : "currentColor";
  const hi = variant === "board" ? "var(--marker)" : "var(--pen)";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      {variant === "board" && <rect width="64" height="64" rx="14" fill="var(--pen)" />}
      {CELLS.map(({ r, c }) => {
        const on = r === 1 && c === 1;
        return (
          <rect
            key={`${r}${c}`}
            x={8 + c * 17}
            y={8 + r * 17}
            width="14"
            height="14"
            rx="4"
            fill={on ? hi : base}
            opacity={on ? 1 : 0.28}
          />
        );
      })}
    </svg>
  );
}

export function Wordmark({ locale, className = "" }: { locale: Locale; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-ink ${className}`}>
      <Mark className="h-8 w-8 shrink-0" />
      <span className="text-[1.25rem] font-medium leading-none">
        {locale === "ar" ? "لينكتك" : "Linktich"}
      </span>
    </span>
  );
}
