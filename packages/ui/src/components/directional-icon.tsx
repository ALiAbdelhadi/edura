import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

export function DirectionalIcon({
  icon: Icon,
  className,
  ...props
}: { icon: LucideIcon } & React.ComponentProps<LucideIcon>) {
  return <Icon className={cn("rtl:-scale-x-100", className)} {...props} />;
}
