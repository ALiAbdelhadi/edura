"use client";

import { Container } from "@/components/kit/container";
import { useEffect, useState } from "react";

/**
 * The per-page section nav.
 *
 * `position: sticky` — which is exactly why the site uses Lenis rather than
 * ScrollSmoother (D-047). ScrollSmoother transforms a wrapper element, and a
 * transformed ancestor makes `sticky` behave as `static`, so this bar would
 * simply scroll away.
 *
 * The active section is tracked with an IntersectionObserver rather than by
 * comparing scroll offsets on every frame: the browser does the work off the
 * main thread, and it stays correct when a scene's height changes.
 */
export function SubNav({
  sections,
}: {
  sections: readonly { id: string; label: string }[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        // The topmost intersecting section wins. Taking the LAST entry instead
        // makes the highlight jump backwards when two sections are on screen.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // The band sits just under the sticky header, so a section counts as
      // "current" when its heading is where a reader would be looking.
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-14 z-40 hidden border-b backdrop-blur md:block"
      style={{
        borderColor: "var(--rule)",
        backgroundColor: "color-mix(in oklab, var(--paper) 90%, transparent)",
      }}
    >
      <Container>
        <ul className="flex gap-1 overflow-x-auto py-2">
          {sections.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className="focus-ledger inline-block whitespace-nowrap rounded-[var(--radius-step-sm)] px-3 py-1.5 text-sm"
                  style={{
                    color: isActive ? "var(--indigo)" : "var(--ink-2)",
                    backgroundColor: isActive ? "var(--indigo-soft)" : "transparent",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}
