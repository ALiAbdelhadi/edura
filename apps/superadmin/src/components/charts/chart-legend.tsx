"use client";

type ChartLegendItem = {
  key: string;
  label: string;
  color: string;
};

type ChartLegendProps = {
  items: ChartLegendItem[];
};

/** A single series is already named by the card title, so it skips the legend box. */
export function ChartLegend({ items }: ChartLegendProps) {
  if (items.length < 2) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
