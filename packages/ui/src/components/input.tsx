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
   message beneath — because colour alone is not an error state.

   TWO THINGS ARE TAKEN OFF `type="number"` HERE, and both are defects rather
   than taste:

   1. THE NATIVE SPIN BUTTONS ARE HIDDEN. They are drawn by the browser inside
      the field's own box, on the side the INPUT's direction says is the end —
      so on an amount field written `dir="ltr"` inside an Arabic screen they
      land on the right, exactly where a currency adornment placed by the RTL
      parent also lands, and the two are painted on top of each other. They are
      also the only piece of native chrome left in a system drawn entirely out
      of hairlines. Nothing is lost: every one of these fields is typed into.

   2. A FOCUSED NUMBER INPUT SWALLOWS THE WHEEL AND CHANGES ITS OWN VALUE. On
      this product that reads: someone tabs into an amount, scrolls the dialog
      to reach the confirm button, and pays a different figure than the one they
      read. Blurring on wheel gives the scroll back to the page and leaves the
      value alone. */
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
