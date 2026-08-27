export type MoneyTone = "out" | "in" | "net" | "muted" | "plain";

const TONE: Record<MoneyTone, string> = {
  out: "text-red",
  in: "text-(--money-in)",
  net: "font-semibold text-ink",
  muted: "text-ink-2",
  plain: "",
};

export function Figure({
  value,
  currency,
  className = "",
  emphasis = false,
  post = false,
  total = false,
  tone = "plain",
}: {
  value: string;
  currency?: string;
  className?: string;
  emphasis?: boolean;
  post?: boolean;
  total?: boolean;
  tone?: MoneyTone;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span
        className={`figure ${TONE[tone]} ${
          emphasis ? "text-[1.375rem] font-medium" : "text-[0.9375rem]"
        }`}
        {...(post || total ? { "data-count": value } : {})}
        {...(post && !total ? { "data-figure": "" } : {})}
        {...(total ? { "data-total-figure": "", "data-total": "" } : {})}
      >
        {value}
      </span>
      {currency ? <span className="text-[0.6875rem] text-ink-3">{currency}</span> : null}
    </span>
  );
}
