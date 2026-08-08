"use client"

import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

/* A table never wraps a cell (see TableCell/TableHead below) — a wrapped row is a
   row you cannot scan, and on a money screen a wrapped figure reads as two. The
   consequence is that a table is WIDER than a phone, so horizontal scroll is the
   intended behaviour, not a failure of one.

   What is a failure is a scroll nobody can see. The overlays below fade in at
   whichever edge still has content behind it, so "there is more to the start/end"
   is visible rather than discovered by accident. They are `start`/`end` and use
   `rtl:` gradient variants, so the Arabic side is not an afterthought. */
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
      // RTL reports scrollLeft as negative (or reversed) depending on the engine;
      // the distance from the START edge is what we actually want, in both.
      const fromStart = Math.abs(el.scrollLeft)
      const next = { start: fromStart > 1, end: fromStart < max - 1 }
      setEdges((p) => (p.start === next.start && p.end === next.end ? p : next))
    }

    update()
    el.addEventListener("scroll", update, { passive: true })
    // Column widths change with the data, not only with the viewport.
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
        // Dividers are --rule-2, the 7%-of-ink hairline. --rule at 16% is the
        // STRUCTURAL rule (the table's own edge); using it between every row
        // turns a table into a grid and the rows stop reading as one object.
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
        // 34px on --field — the compact density's header. The direction also
        // specifies the LABEL as mono 10px/0.12em uppercase; that is applied
        // per-table via className rather than here, because IBM Plex Mono ships
        // no Arabic glyphs and most headers in this product are Arabic. See the
        // header comment on <StatusBadge> for the same trap and the same rule.
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
        // 7px vertical, the compact density. Horizontal stays 8px so a numeric
        // column's end alignment does not sit flush against the table's edge.
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
