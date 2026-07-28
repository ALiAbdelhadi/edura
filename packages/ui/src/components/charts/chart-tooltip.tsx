"use client";

type ChartTooltipPayloadItem = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
};

export function ChartTooltip({
  active,
  label,
  payload,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean;
  label?: string;
  payload?: ChartTooltipPayloadItem[];
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    // --lift-2: a tooltip is an overlay, the only thing the second elevation level is for.
    <div className="min-w-36 rounded-md border border-rule bg-sheet px-3 py-2 text-xs shadow-[var(--lift-2)]">
      {label ? (
        <div className="mb-1.5 font-medium text-ink">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <div
            key={`${entry.dataKey ?? entry.name ?? index}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-ink-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            {/* A tooltip value is a figure the system computed — same rule as everywhere. */}
            <span className="num font-medium text-ink">
              {valueFormatter && typeof entry.value === "number"
                ? valueFormatter(entry.value)
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
