"use client";

import { useScene } from "@/lib/motion/use-scene";
import { Num } from "@repo/ui/components/num";
import { useLocale } from "next-intl";
import { useRef } from "react";
import type { Locale } from "@/lib/i18n";

export type Stat = {
  value: number;
  suffix?: string;
  label: string;
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