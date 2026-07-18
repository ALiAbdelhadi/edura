"use client";

type ChartTooltipPayloadItem = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: ChartTooltipPayloadItem[];
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
};

export function ChartTooltip({
  active,
  label,
  payload,
  valueFormatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-36 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label ? (
        <div className="mb-1.5 font-medium text-popover-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <div
            key={`${entry.dataKey ?? entry.name ?? index}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums text-popover-foreground">
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
