import { Spinner as ShadcnSpinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <ShadcnSpinner className={cn("size-4", className)} />;
}

export function PageSpinner({ label }: { label?: React.ReactNode }) {
  return (
    <div className="flex min-h-64 w-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <ShadcnSpinner className="size-6 text-primary" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}
