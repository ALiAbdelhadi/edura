import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

/* <Plate> — how a screenshot is presented.
   ══════════════════════════════════════════════════════════════════════════════

   A product screenshot dropped straight onto the page competes with the page: it
   arrives with its own white ground, its own rules and its own type, all at a
   different scale from everything around it. The plate is the frame that says
   "this is a reproduction of something else" — a 13px mat of --field, ruled
   once outside and once inside, the way a plate is mounted in a printed book.

   The INNER rule is the part that does the work. Without it the image bleeds
   into the mat and the mat reads as accidental padding; with it the image has an
   edge of its own, and the mat becomes a deliberate margin.

   The caption is a two-part row, and the split is not decorative: the PATH is
   mono because it is a literal string someone could type, and the NOTE is the
   body face because it is prose. Putting both in one family would make the path
   look like commentary and the note look like data. */
export function Plate({
  children,
  path,
  note,
  className,
}: {
  children: ReactNode;
  /** The literal route or file this reproduces — `/dashboard/admin/counter`. */
  path?: string;
  /** Prose. What the reader should notice. */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("m-0", className)}>
      <div
        className="rounded-(--radius-step-lg) border p-[13px]"
        style={{
          backgroundColor: "var(--field)",
          borderColor: "var(--rule)",
          boxShadow: "var(--elev-md)",
        }}
      >
        <div
          className="overflow-hidden rounded-[6px] border"
          style={{ borderColor: "var(--rule)" }}
        >
          {children}
        </div>
      </div>

      {path || note ? (
        <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {path ? (
            // ltr-island: a path is Latin and must not be reordered by an
            // Arabic paragraph direction — `/dashboard/admin` would render with
            // its leading slash on the wrong end.
            <span
              className="num ltr-island text-[11px]"
              style={{ color: "var(--ink-3)" }}
            >
              {path}
            </span>
          ) : (
            <span />
          )}
          {note ? (
            <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
              {note}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
