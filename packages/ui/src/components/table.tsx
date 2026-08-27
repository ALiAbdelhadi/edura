"use client"

import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      if (max <= 1) {
        setEdges((p) => (p.start || p.end ? { start: false, end: false } : p))
        return
      }
      const fromStart = Math.abs(el.scrollLeft)
      const next = { start: fromStart > 1, end: fromStart < max - 1 }
      setEdges((p) => (p.start === next.start && p.end === next.end ? p : next))
    }

    update()
    el.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [])

  return (
    <div data-slot="table-frame" className="relative w-full">
      <div
        ref={scrollerRef}
        data-slot="table-container"
        className="w-full overflow-x-auto overscroll-x-contain"
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>

      <span
        aria-hidden="true"
        data-slot="table-scroll-start"
        className={cn(
          "pointer-events-none absolute inset-y-0 start-0 w-6 transition-opacity duration-200",
          "from-ink/12 to-transparent ltr:bg-gradient-to-r rtl:bg-gradient-to-l",
          edges.start ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden="true"
        data-slot="table-scroll-end"
        className={cn(
          "pointer-events-none absolute inset-y-0 end-0 w-6 transition-opacity duration-200",
          "from-ink/12 to-transparent ltr:bg-gradient-to-l rtl:bg-gradient-to-r",
          edges.end ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted/40 [&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-rule-2 transition-colors hover:bg-field has-aria-expanded:bg-field data-[state=selected]:bg-field",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-[34px] bg-field px-2 text-start align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-ink-3 uppercase [&:has([role=checkbox])]:pe-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2 py-[7px] align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
