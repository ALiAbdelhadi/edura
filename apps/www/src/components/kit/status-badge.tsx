import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

export type StatusTone =
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "primary"
  | "neutral";

/** High-contrast soft status chip (replaces coloured AntD `Tag`). */
const TONE: Record<StatusTone, string> = {
  success: "border-transparent bg-success/15 text-success",
  warning: "border-transparent bg-warning/15 text-warning",
  info: "border-transparent bg-info/15 text-info",
  danger: "border-transparent bg-destructive/15 text-destructive",
  primary: "border-transparent bg-primary/12 text-primary",
  neutral: "border-transparent bg-muted text-muted-foreground",
};

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return <Badge className={cn(TONE[tone], className)}>{children}</Badge>;
}
