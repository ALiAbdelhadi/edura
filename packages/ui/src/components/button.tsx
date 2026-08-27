import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@repo/ui/lib/utils"

const buttonVariants = cva(
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

        ledger:
          "bg-ink text-paper hover:bg-ink-2 disabled:opacity-45",
        gold: "border border-gold bg-transparent text-gold-deep hover:bg-gold-soft disabled:opacity-45",
        "ledger-ghost":
          "border border-transparent bg-transparent text-ink-2 hover:border-rule hover:text-ink disabled:opacity-45",
        money:
          "border-[1.5px] border-red bg-transparent text-red hover:bg-red-soft disabled:opacity-45",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        touch: "h-12 rounded-md px-6 text-base has-[>svg]:px-5",
        ledger: "h-[38px] rounded-(--radius-step-md) px-[18px] text-sm font-medium",
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
