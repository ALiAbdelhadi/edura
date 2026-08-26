"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@repo/ui/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // The scrim and its fade live in `chrome-2026.css`, keyed on the
        // `data-slot` above, so this drawer and a modal darken the page by the
        // same amount in the same hue. `bg-black/50` was soot.
        "fixed inset-0 z-50",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // The stylesheet keys its per-side entrance off this. The stock
        // component expressed the same thing as `data-[state=open]:slide-in-
        // from-right` utilities, which is why it could not also carry the
        // token durations — a drawer took 500ms in and 300ms out, the slowest
        // motion in the product and a band this system does not have.
        data-side={side}
        className={cn(
          // Surface, hairline, elevation and motion come from
          // `chrome-2026.css`. `duration-300`/`duration-500` are gone with
          // them: a drawer taking half a second was the slowest thing in the
          // product and belonged to no band this system has.
          "fixed z-50 flex flex-col outline-none",
          // PHYSICAL, not logical, and this was got wrong once and caught in
          // the browser: `side` is a physical prop — a caller asking for
          // `side="right"` means the right of the screen in either script — so
          // the edge it is attached to is physical too. `border-s` / `rounded-s`
          // put both on the RIGHT in Arabic, which is the edge that is against
          // the screen: the drawer drew its hairline and its radius on the side
          // nobody can see and left the inner edge square.
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l rounded-l-(--chrome-radius-lg) sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r rounded-r-(--chrome-radius-lg) sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b rounded-b-(--chrome-radius-lg)",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t rounded-t-(--chrome-radius-lg)",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            // Same attribute the modal's close carries, so the two are one
            // affordance: a 32px target with a real fill and focus ring, rather
            // than a 16px glyph at `opacity: 0.7`.
            data-dialog-dismiss=""
            className="absolute top-3 end-3 z-20 inline-flex size-8 items-center justify-center disabled:pointer-events-none"
          >
            <XIcon className="size-4 shrink-0" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1.5 px-4 pt-4 pb-3 pe-12 text-start",
        className
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 px-4 pt-3 pb-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base leading-6 font-semibold text-(--chrome-fg)", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm leading-5 text-(--chrome-fg-muted)", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
