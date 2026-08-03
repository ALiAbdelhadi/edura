"use client";

import { useScene } from "@/lib/motion/use-scene";
import { Num } from "@repo/ui/components/num";
import { useLocale } from "next-intl";
import { useRef } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Figures that count up as they arrive.
 *
 * WHAT MAY AND MAY NOT APPEAR HERE (binding)
 * ----------------------------------------------------------------------------
 * Only values that are DERIVED — computed on screen from an arithmetic the
 * reader can follow, or counted from the seeded demo center. Never an adoption
 * claim ("10,000 students"), because no such number exists anywhere in this
 * repo to cite and inventing one is the single easiest way to make every other
 * claim on the site suspect.
 *
 * The count-up is the one animation D-044 buys here, and it buys it for a
 * reason: these figures are DERIVED, so watching them resolve is watching the
 * derivation happen. A number that was simply typed would not earn it.
 *
 * Figures use `<Num>` — Latin digits, IBM Plex Mono, tabular, direction-isolated
 * — because they are data, exactly as in the product (CONSTITUTION.md §6.3).
 */
export type Stat = {
  value: number;
  /** Rendered after the figure: «حصة», «ج.م», «%». */
  suffix?: string;
  label: string;
  /** Where the number comes from. Shown small, so a reader can check it. */
  source?: string;
};

export function Counters({ stats }: { stats: readonly Stat[] }) {
  const locale = useLocale() as Locale;
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const ref = useScene(({ gsap, ScrollTrigger, root }) => {
    stats.forEach((stat, i) => {
      const el = valueRefs.current[i];
      if (!el) return;
      const box = { n: 0 };

      gsap.to(box, {
        n: stat.value,
        duration: 1.1,
        ease: "power2.out",
        scrollTrigger: { trigger: root, start: "top 78%", once: true },
        onUpdate: () => {
          // Written straight to textContent rather than through React state:
          // sixty re-renders a second for a number that is not application
          // state would be pure waste.
          el.textContent = Math.round(box.n).toLocaleString(
            locale === "ar" ? "ar-EG-u-nu-latn" : "en-US",
          );
        },
      });
    });
    void ScrollTrigger;
  }, [locale]);

  return (
    <div ref={ref} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="border-t pt-5"
          style={{ borderColor: "var(--rule)" }}
        >
          <p className="flex items-baseline gap-1">
            <Num className="text-3xl font-semibold" style={{ color: "var(--ink)" }}>
              {/* Server-rendered as the FINAL value, so a reader with no JS —
                  or with reduced motion, where no timeline is ever built —
                  sees the real figure rather than a zero. */}
              <span
                ref={(el) => {
                  valueRefs.current[i] = el;
                }}
              >
                {stat.value.toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US")}
              </span>
            </Num>
            {stat.suffix ? (
              <span className="text-base font-medium" style={{ color: "var(--ink-2)" }}>
                {stat.suffix}
              </span>
            ) : null}
          </p>
          <p className="mt-2 text-sm font-medium" style={{ color: "var(--ink)" }}>
            {stat.label}
          </p>
          {stat.source ? (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
              {stat.source}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
