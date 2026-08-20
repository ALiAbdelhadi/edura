"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@repo/ui/lib/utils"
import { Button } from "@repo/ui/components/button"

/* The modal.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This was the last stock-shadcn surface in a shell that had already been
 * redesigned — `bg-background`, `rounded-lg`, Tailwind's soot `shadow-lg`,
 * `bg-black/50`, `zoom-in-95`. None of those was a decision anybody made about
 * this product, and together they were what "the dialog looks old" meant.
 *
 * WHERE THE LOOK LIVES, and the split is load-bearing. Colour, hairline, radius,
 * elevation and motion are in `packages/ui/src/styles/chrome-2026.css`, keyed on
 * the `data-slot` attributes below, beside the command palette and the identity
 * menu that already render through the same kind of portal. What stays HERE is
 * everything a call site overrides — `max-width`, padding, `overflow`, layout —
 * because those have to keep merging through `cn()`. Twenty-nine of the fifty
 * dialogs in this repo pass their own `sm:max-w-*`, and a plain CSS rule would
 * tie with those utilities on specificity and be settled by bundle order.
 *
 * TWO FORMS, ONE COMPONENT. Below `sm` it is a BOTTOM SHEET: attached to the
 * bottom edge, full width, top corners rounded, entering from the edge it is
 * attached to. Not fashion — `design/CONSTITUTION.md` §5 describes the person
 * this product is hardest on, a receptionist standing one-handed with a queue in
 * front of them, and a card floating in the middle of a 390px screen puts every
 * control at the top of the reach arc. At `sm` and above it is a centred card,
 * because a mouse has no reach arc.
 *
 * NOTHING FALLS OFF THE BOTTOM ANY MORE. The old content had no max-height at
 * all: a long form on a 720px laptop pushed its own submit button past the edge
 * of the screen with nothing on screen to say so. The panel now has a height cap
 * and scrolls, and the header and footer are STICKY — so the title and the
 * actions hold their place while the body moves under them. That works whether
 * or not a call site wraps its body in anything, which is why no new sub-
 * component was added for it: fifty call sites, zero adoption cost.
 */

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50", className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // `p-6` and `gap-4` are UNCHANGED from the old panel, on purpose:
          // most of the fifty call sites put their body straight into this
          // element and inherited both. Changing them would have re-spaced
          // every dialog in the product as a side effect of a reskin.
          "z-50 flex flex-col gap-4 p-6 outline-none",
          // Scroll rather than clip. `overflow-hidden` would have been tidier
          // with the rounded corners and is the wrong default here: a dialog
          // taller than its cap must still be reachable, and a clipped one is
          // strictly worse than today's overflowing one.
          "overflow-x-hidden overflow-y-auto overscroll-contain",
          // ── the phone form: a bottom sheet ──────────────────────────────
          // `svh`, not `vh`: on iOS Safari `vh` measures the viewport with the
          // browser chrome hidden, so a sheet capped in `vh` is taller than the
          // screen it is on and its last row sits under the address bar.
          "fixed inset-x-0 bottom-0 max-h-[92svh] w-full",
          "rounded-t-(--chrome-radius-lg) border-t",
          // ── the desktop form: a centred card ────────────────────────────
          // `left-1/2` + `-translate-x-1/2` and not the logical `start-1/2`:
          // centring is pure geometry and reads the same in both directions,
          // whereas a logical inset paired with a physical translate lands the
          // panel off-centre in RTL — which is this product's primary script.
          //
          // The height cap is `min()` of the viewport and a fixed ceiling, so a
          // dialog is never taller than the screen AND never absurdly tall on a
          // 1440p monitor: a 900px confirm box is its own kind of dated.
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-[calc(100%-3rem)] sm:max-w-md",
          "sm:max-h-[min(calc(100svh-4rem),44rem)]",
          "sm:rounded-(--chrome-radius-lg) sm:border",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            // The attribute is what the stylesheet keys on, rather than
            // `data-slot` alone: `DialogClose` is also exported for callers to
            // wrap their own footer buttons in, and those must not inherit a
            // 32px icon square.
            data-dialog-dismiss=""
            // A 32px square, not the old bare 16px glyph at `opacity: 0.7` —
            // under the 24×24 minimum WCAG 2.2 §2.5.8 sets for a pointer
            // target, and an opacity change is the weakest hover signal there
            // is. The fill and the focus ring are in the stylesheet.
            //
            // `absolute`, so it does scroll away on a dialog long enough to
            // scroll. Deliberate: making it sticky would put it either above
            // the sticky header or inside it, and both cost more than they buy
            // — Escape and a click on the scrim dismiss from any scroll
            // position, and this button is the third way, not the only one.
            className="absolute top-3 end-3 z-20 inline-flex size-8 items-center justify-center disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // STICKY, and the negative offsets are the whole trick. A sticky child of
      // a padded scroll container sticks to the PADDING edge, so `top-0` would
      // have left a 24px slot above the band for content to scroll through in
      // full view. `-top-6` sticks it flush to the panel edge instead, and the
      // matching `-mt-6 -mx-6 px-6` bleeds the band and its hairline to the
      // full width the panel already reserved.
      //
      // START-aligned in both scripts, never centred. Centred dialog copy is a
      // dated tell on its own, and in Arabic it also breaks the scan: the eye
      // starts at the edge every line begins on, and centring moves that edge
      // for every title of a different length.
      className={cn(
        "sticky -top-6 z-10 -mx-6 -mt-6 flex shrink-0 flex-col gap-1.5",
        // `pe-12` reserves the close button's corner so a long title cannot
        // run underneath it — it could, and did, in Arabic, where the title
        // grows toward that same corner.
        "bg-(--chrome-surface) px-6 pt-5 pb-4 pe-12 text-start",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      // `flex-col`, NOT `flex-col-reverse`. The convention across this repo is
      // Cancel first in the DOM and the primary action last, so on a bottom
      // sheet a plain column puts the primary action LOWEST — nearest the thumb
      // of the person the sheet form exists for. `col-reverse` put it furthest,
      // which was defensible for a centred card and is not for a sheet.
      // Desktop is unchanged: an end-justified row in DOM order.
      className={cn(
        "sticky -bottom-6 z-10 -mx-6 -mb-6 flex shrink-0 flex-col gap-2",
        "bg-(--chrome-surface) px-6 pt-4 pb-5",
        "[&>*]:w-full sm:flex-row sm:justify-end sm:[&>*]:w-auto",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // 16px, not 18: the title of a 448px panel is not competing with a page
      // heading. And `leading-6` rather than the old `leading-none`, which
      // clips the Arabic descenders that hang below the baseline in ي and ج.
      className={cn(
        "text-base leading-6 font-semibold text-(--chrome-fg)",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-5 text-(--chrome-fg-muted)", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
