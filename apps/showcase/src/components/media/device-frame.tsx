import type { ReactNode } from "react";

/**
 * Device frames, drawn in the Ledger system rather than imported.
 *
 * No third-party mockup asset, no vendor chrome, no gradient "glass" bezel:
 * the frames are hairline rules and the two elevation levels the system already
 * has, so a screenshot sits in the same object language as the rest of the
 * page. A photorealistic MacBook would be the first thing on the site that is
 * not derived from the design system (CONSTITUTION.md §2).
 *
 * Both frames are pure CSS/SVG chrome around a child. They set no width — the
 * scene decides — and they never mirror in RTL: a laptop and a phone are
 * OBJECTS, and §6.4's rule is that an icon depicting an object does not flip.
 */

export function BrowserFrame({
  children,
  label,
}: {
  children: ReactNode;
  /** Shown in the address bar. A path, never a fake domain. */
  label?: string;
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        backgroundColor: "var(--sheet)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-step-lg)",
        boxShadow: "var(--lift-2)",
      }}
    >
      {/* Chrome bar. `dir="ltr"` is deliberate: a browser's own furniture does
          not mirror with the page's content language. */}
      <div
        dir="ltr"
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--rule)", backgroundColor: "var(--field)" }}
      >
        <span className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-[9px] w-[9px] rounded-full"
              style={{ border: "1px solid var(--rule)" }}
            />
          ))}
        </span>
        {label ? (
          <span
            className="ms-2 truncate rounded-[5px] px-2 py-0.5 font-mono text-[10px]"
            style={{
              backgroundColor: "var(--sheet)",
              border: "1px solid var(--rule)",
              color: "var(--ink-3)",
            }}
          >
            {label}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        backgroundColor: "var(--sheet)",
        border: "1px solid var(--rule)",
        // A phone's corner radius is much larger than the system's largest
        // step, so it is stated here rather than pretending a token fits.
        borderRadius: "28px",
        padding: "8px",
        boxShadow: "var(--lift-2)",
      }}
    >
      <div className="overflow-hidden" style={{ borderRadius: "21px" }}>
        {children}
      </div>
      {/* The speaker slot — one hairline pill, not a notch cut-out. */}
      <span
        aria-hidden
        className="absolute start-1/2 top-[14px] h-[3px] w-[46px] -translate-x-1/2 rounded-full"
        style={{ backgroundColor: "var(--rule)" }}
      />
    </div>
  );
}
