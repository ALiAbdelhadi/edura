import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

function Input({ className, type, onWheel, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      onWheel={(event) => {
        if (type === "number" && document.activeElement === event.currentTarget) {
          event.currentTarget.blur()
        }
        onWheel?.(event)
      }}
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-rule bg-field px-3 py-1 text-base transition-[color,border-color] outline-none selection:bg-indigo selection:text-indigo-ink file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 md:text-sm",
        "focus-visible:border-indigo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
        "aria-invalid:border-red aria-invalid:bg-red-soft",
        "[&[type=number]]:[appearance:textfield] [&[type=number]::-webkit-inner-spin-button]:[appearance:none] [&[type=number]::-webkit-outer-spin-button]:[appearance:none]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
