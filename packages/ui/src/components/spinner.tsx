"use client"

import { Loader2Icon } from "lucide-react"

import { useKitStrings } from "@repo/ui/lib/kit-strings"
import { cn } from "@repo/ui/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const strings = useKitStrings()
  return (
    <Loader2Icon
      role="status"
      aria-label={strings.loading}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
