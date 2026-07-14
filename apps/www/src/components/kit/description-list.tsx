import { cn } from "@repo/ui/lib/utils";

/** Key/value detail grid (replaces AntD `Descriptions`). */
export function DescriptionList({
  items,
  columns = 2,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const cols =
    columns === 1
      ? "sm:grid-cols-1"
      : columns === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-2";
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", cols, className)}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {it.label}
          </dt>
          <dd className="text-sm text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
