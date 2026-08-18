import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@repo/ui/lib/utils"

const buttonVariants = cva(
  // Focus is a 2px --indigo outline at 2px offset — ONE focus shape across the
  // product, matching Input and the `focus-ledger` utility. It replaces shadcn's
  // 3px translucent ring: an outline is drawn outside the border box so it never
  // reflows or clips, and unlike a box-shadow ring it survives forced-colors
  // mode rather than being dropped.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",

        // ── The "Classical Ledger" set ────────────────────────────────────────
        //
        // These are the direction's buttons. They are ADDITIVE variants rather
        // than a repaint of `default`, deliberately: `default` is the indigo
        // primary on 25+ back-office screens, and the direction states plainly
        // that the ERP screens are NOT yet designed in this language and must
        // not be reskinned ad hoc. Flipping `default` would do exactly that,
        // invisibly, from one line of this file.
        //
        // Marketing surfaces use these three. When the ERP is designed in this
        // language, `default` becomes an alias of `ledger` and these names go
        // away — that is a decision about the whole product, not about a cva.
        //
        // `ledger` is the ONLY solid button in the set. Everything else is a
        // stroke, which is what makes the one solid read as the primary action.
        ledger:
          "bg-ink text-paper hover:bg-ink-2 disabled:opacity-45",
        // Gold is a STROKE and the label is --gold-deep: --gold itself does not
        // hold 4.5:1 at text sizes on any of the three grounds.
        gold: "border border-gold bg-transparent text-gold-deep hover:bg-gold-soft disabled:opacity-45",
        // Border is transparent rather than absent, so the hover does not shift
        // the label by a pixel when the rule appears.
        "ledger-ghost":
          "border border-transparent bg-transparent text-ink-2 hover:border-rule hover:text-ink disabled:opacity-45",
        // The money confirm. Heavier stroke (1.5px) than any other button in the
        // set, because weight is the only escalation available in a system where
        // colour is a stroke. Pair with `size="ledger-money"` and put the amount
        // INSIDE the label in mono: the operator is authorising a specific
        // number, not a row they happen to have selected, so the figure travels
        // with the button rather than sitting above it where a changed
        // selection can leave the two disagreeing. The two-step commit built on
        // this is `TwoStepCommit` in apps/www (features/admin/ledger/commit.tsx).
        money:
          "border-[1.5px] border-red bg-transparent text-red hover:bg-red-soft disabled:opacity-45",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        // The `touch` density (Handoff II §4): center-staff check-in, where a
        // receptionist is standing, one-handed, with a queue waiting. 48px minimum
        // target, 16px minimum type. Deliberation is the wrong virtue on that
        // surface; certainty is. It also matches the 48px `h-12` inputs those
        // screens already use, which `size="lg"` (40px) did not.
        touch: "h-12 rounded-md px-6 text-base has-[>svg]:px-5",
        // The direction's own button metrics: 38px tall, 18px side padding,
        // 10px radius, 14px/500 body face.
        ledger: "h-[38px] rounded-(--radius-step-md) px-[18px] text-sm font-medium",
        // The money-confirm size. Taller than an ordinary button on purpose —
        // it is the one control that writes something irreversible.
        "ledger-money":
          "h-[42px] gap-[10px] rounded-(--radius-step-md) px-[18px] text-sm font-semibold",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Keeps the LABEL and adds a spinner beside it — it never swaps the label
     * out. A button whose text disappears mid-submit stops telling the operator
     * what is in flight, which on a money screen is the one thing they need.
     * Ignored under `asChild`, which renders a foreign element.
     */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }), loading && "opacity-75")}
      {...props}
    >
      {/* Under `asChild` this MUST pass `children` through untouched. Radix Slot
          requires exactly one element child, and wrapping — or even emitting a
          `null` sibling — hands it an array of two and throws at render. */}
      {asChild || !loading ? (
        children
      ) : (
        <>
          <span
            aria-hidden
            className="size-[11px] shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none"
          />
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
