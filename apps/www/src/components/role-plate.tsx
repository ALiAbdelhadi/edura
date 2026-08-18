"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

import { D, E } from "@/lib/motion";
import { MEDIA, type MediaKey } from "@/media/manifest";
import { Plate } from "./plate";
import type { Locale } from "@/i18n/config";

export type RoleEntry = {
  key: MediaKey;
  who: string;
  question: string;
  detail: string;
  caption: string;
};

/**
 * Five roles, ONE plate.
 *
 * Five screenshots stacked down the page are five things nobody compares.
 * One plate that changes as you move between the roles is a comparison, and
 * it turns the roles register from a list into an instrument — which is the
 * only reason any of this is interactive.
 *
 * It takes DATA, not a render prop. A function cannot cross the server →
 * client boundary, so the rows are rendered here from plain strings; they
 * still server-render, and the only thing hydration adds is the selection.
 *
 * The control is a real radio group: arrow keys move between roles, focus
 * moves the plate exactly as hover does, and each role announces its own
 * name. A hover-only swap hands keyboard and touch readers a screenshot they
 * can never change.
 */
export function RolePlate({
  entries,
  plateLabel,
  locale,
}: {
  entries: RoleEntry[];
  locale: Locale;
  /** Names the group for a screen reader, and labels the reserved plate. */
  plateLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const scope = useRef<HTMLDivElement>(null);
  const previous = useRef(0);

  useGSAP(
    () => {
      if (previous.current === index) return;
      previous.current = index;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // A crossfade with a short rise, not a slide: the plates are the same
        // object seen from different desks, so nothing should travel between
        // them. `overwrite` matters — arrowing through five roles fires five
        // tweens on one element, and without it they queue and the plate lags
        // behind the selection.
        gsap.fromTo(
          "[data-role-plate]",
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: D.ink, ease: E.arrive, overwrite: "auto" },
        );
      });
      return () => mm.revert();
    },
    { scope, dependencies: [index] },
  );

  function onKeyDown(event: KeyboardEvent<HTMLElement>, i: number) {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const back = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !back) return;
    event.preventDefault();
    // The roles are listed vertically and the DOM order matches the visual
    // order in both scripts, so Down and Right both mean "the next one".
    const next = (i + (forward ? 1 : -1) + entries.length) % entries.length;
    setIndex(next);
    const list = event.currentTarget.parentElement;
    list?.querySelectorAll<HTMLElement>("[role='radio']")[next]?.focus();
  }

  const current = entries[index]!;

  return (
    <div ref={scope} className="grid gap-12 lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-14">
      <dl role="radiogroup" aria-label={plateLabel} className="border-t border-rule">
        {entries.map((entry, i) => (
          /* Selection is a TICK IN THE MARGIN and a lifted ground — the two
             marks a bookkeeper makes on the line being worked. Deliberately
             not dimming the other rows: `--ink-3` detail text at 60% opacity
             falls to about 2.5:1, so four roles would become unreadable to
             make one readable. And deliberately not a thick coloured bar down
             the edge, which is the stock treatment for exactly this and reads
             as a component library rather than as this page. */
          <div
            key={entry.who}
            role="radio"
            aria-checked={i === index}
            aria-label={entry.who}
            tabIndex={i === index ? 0 : -1}
            onMouseEnter={() => setIndex(i)}
            onFocus={() => setIndex(i)}
            onClick={() => setIndex(i)}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={`relative grid cursor-pointer gap-3 border-b border-rule py-7 outline-offset-4 transition-colors sm:grid-cols-[10rem_1fr] sm:gap-10 ${
              i === index ? "bg-sheet" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-9 -start-4 hidden h-[2px] w-3 bg-gold transition-opacity sm:block ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
            />
            <dt className="display text-[1.1875rem] leading-snug text-ink">
              {entry.who}
            </dt>
            <dd className="min-w-0">
              <p className="max-w-[46ch] text-[1.0625rem] leading-[1.6] text-ink">
                {entry.question}
              </p>
              <p className="mt-2.5 max-w-[62ch] text-[0.9375rem] leading-[1.75] text-ink-3">
                {entry.detail}
              </p>

              {/* On a phone the plate belongs UNDER THE ROW that selects it.
                  The side column stacks below the whole list at that width, so
                  tapping a role would change a screenshot the reader cannot
                  see — the interaction would appear to do nothing.

                  Only the selected row renders one, so at most one extra plate
                  exists. Above `lg` it is `display: none` and `next/image`
                  lazy-loads, so a hidden plate never costs a request. */}
              {i === index ? (
                <div data-role-plate="" className="mt-6 lg:hidden">
                  <Plate
                    slot={MEDIA[entry.key]}
                    caption={entry.caption}
                    reservedLabel={`${plateLabel} · ${entry.who}`}
                    locale={locale}
                  />
                </div>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {/* The side column, desktop only — below `lg` the plate lives inside the
          selected row instead, where the reader can actually see it change. */}
      <div className="hidden lg:sticky lg:top-32 lg:block lg:self-start">
        {/* `key` forces a fresh element per role so the crossfade has
            something to fade IN, rather than tweening a node that never
            changed and producing a flash with no transition. */}
        <div data-role-plate="" key={current.key}>
          <Plate
            slot={MEDIA[current.key]}
            caption={current.caption}
            reservedLabel={`${plateLabel} · ${current.who}`}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
