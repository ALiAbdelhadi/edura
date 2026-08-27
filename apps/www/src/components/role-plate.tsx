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

export function RolePlate({
  entries,
  plateLabel,
  locale,
}: {
  entries: RoleEntry[];
  locale: Locale;
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

      <div className="hidden lg:sticky lg:top-32 lg:block lg:self-start">
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
