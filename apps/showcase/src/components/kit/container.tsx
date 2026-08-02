import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps } from "react";

/** The site's single horizontal measure. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}
      {...props}
    />
  );
}
