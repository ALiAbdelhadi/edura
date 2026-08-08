import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

/* The field.
   ══════════════════════════════════════════════════════════════════════════════

   40px tall, 10px radius (inherited from --radius-step-md), filled with --field
   and ruled with --rule. The fill is what distinguishes an input from a card in
   a system built out of hairlines: with a transparent background the two are the
   same rectangle.

   FOCUS IS A 2px --indigo OUTLINE AT 2px OFFSET, everywhere, and it replaces the
   3px translucent ring shadcn ships. Two reasons it is an outline and not a
   ring: `outline` is drawn outside the border box so it never reflows the field
   or clips against a neighbour, and it survives forced-colors mode, where a
   box-shadow ring is simply dropped and the field would focus invisibly. The
   same treatment is on Button and in the `focus-ledger` utility, so a keyboard
   user sees ONE focus shape across the product.

   Error is stated three ways — a --red border, a --red-soft fill, and the
   message beneath — because colour alone is not an error state. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-rule bg-field px-3 py-1 text-base transition-[color,border-color] outline-none selection:bg-indigo selection:text-indigo-ink file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 md:text-sm",
        "focus-visible:border-indigo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
        "aria-invalid:border-red aria-invalid:bg-red-soft",
        className
      )}
      {...props}
    />
  )
}

export { Input }
