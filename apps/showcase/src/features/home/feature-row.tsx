"use client";

/* The feature row.
   ══════════════════════════════════════════════════════════════════════════════

   Three columns, separated by hairlines rather than boxed into cards. The
   difference matters in this system: a card is a surface with its own ground and
   elevation, and three of them side by side read as three separate objects. A
   rule between columns says the opposite — one row, read across.

   The separator is drawn as a border on the START side of every column except
   the first, so it flips with direction automatically (`border-s`) and there is
   no rule hanging off the edge of the row.

   Copy is the existing `owners.*` keys, verbatim — the same three the design
   document put on the landing: the counter, settlement, and the record. */

import { Container } from "@/components/kit/container";
import type { Locale } from "@/lib/i18n";
import { reveal } from "@/lib/motion/reveal";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale, useTranslations } from "next-intl";

const COLUMNS = ["counter", "settlement", "ledger"] as const;

export function FeatureRow() {
  const t = useTranslations("owners");
  const locale = useLocale() as Locale;
  const arabic = locale === "ar";

  const ref = useScene(({ q, isRtl, gsap }) => {
    gsap
      .timeline()
      .add(reveal(gsap, q("[data-col]"), isRtl, { y: 14, stagger: 0.08 }));
  });

  return (
    <section ref={ref} className="border-b" style={{ borderColor: "var(--rule)" }}>
      <Container className="py-16 sm:py-20">
        <div className="grid gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {COLUMNS.map((key, i) => (
            <div
              key={key}
              data-col
              data-reveal
              className={
                i === 0
                  ? "lg:pe-9"
                  : "lg:border-s lg:ps-9 lg:pe-9 " +
                    (i === 1 ? "sm:border-s sm:ps-9 " : "")
              }
              style={{ borderColor: "var(--rule)" }}
            >
              <Eyebrow locale={locale} tone="gold">
                {t(`${key}.eyebrow`)}
              </Eyebrow>

              <h2
                className="mt-4"
                style={{
                  fontFamily: arabic ? "var(--ar-display)" : "var(--lat-display)",
                  fontWeight: arabic ? 700 : 600,
                  fontSize: 23,
                  lineHeight: arabic ? 1.5 : 1.24,
                  letterSpacing: arabic ? undefined : "var(--lat-display-track)",
                  color: "var(--ink)",
                }}
              >
                {t(`${key}.title`)}
              </h2>

              <p
                className="mt-3 max-w-[42ch]"
                style={{
                  fontFamily: arabic ? "var(--ar-body)" : "var(--lat-body)",
                  fontSize: 14.5,
                  lineHeight: arabic ? 1.95 : 1.7,
                  color: "var(--ink-2)",
                }}
              >
                {t(`${key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
