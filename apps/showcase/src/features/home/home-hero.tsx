"use client";

/* The landing hero.
   ══════════════════════════════════════════════════════════════════════════════

   Two columns: the claim, and the receipt that proves it. The grid is
   `auto-fit / minmax(340px, 1fr)` rather than a breakpoint, so the collapse to
   one column happens when 340px of copy stops fitting — not at a width someone
   guessed. 340 is the narrowest the receipt stays readable at.

   The H1 is clamped per SCRIPT, not per viewport alone: 38–66px Latin,
   34–58px Arabic. Arabic sits lower because Amiri's glyphs carry more ink at the
   same point size, and matching the Latin numbers would make the Arabic heading
   visually louder than its English counterpart — on an Arabic-first product,
   the wrong way round. For the same reason the Arabic line-height is 1.34 (the
   floor the direction sets) against Latin's 1.06: connected script with
   descenders needs the room, and letter-spacing — which would be the Latin
   answer — is not available to it.

   All copy is the existing `home.hero` / `home.proof` message keys, verbatim. */

import { Container } from "@/components/kit/container";
import { LedgerHero } from "@/features/home/ledger-hero";
import { Link } from "@/i18n/navigation";
import { registerUrl } from "@/lib/app-links";
import type { Locale } from "@/lib/i18n";
import { reveal, unhide } from "@/lib/motion/reveal";
import { DURATION, EASE } from "@/lib/motion/runtime";
import { splitHeadline } from "@/lib/motion/split-text";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale, useTranslations } from "next-intl";

const PROOF = ["tables", "isolation", "writes"] as const;

export function HomeHero() {
  const t = useTranslations("home.hero");
  const p = useTranslations("home.proof");
  const locale = useLocale() as Locale;
  const arabic = locale === "ar";

  const ref = useScene(({ q, isRtl, gsap, SplitText }) => {
    const heading = q("[data-split]")[0];
    if (!heading) return;

    const split = splitHeadline(SplitText, heading, { mask: true });

    unhide(gsap, heading);

    const tl = gsap.timeline({ defaults: { ease: EASE.play } });

    tl.add(reveal(gsap, q("[data-eyebrow]"), isRtl, { x: 12, from: "start" }))
      .from(
        split.targets,
        { yPercent: 110, duration: DURATION.slow, stagger: 0.045 },
        "-=0.35",
      )
      .add(reveal(gsap, q("[data-sub]"), isRtl, { y: 12 }), "-=0.55")
      .add(reveal(gsap, q("[data-cta]"), isRtl, { y: 10 }), "-=0.4")
      .add(reveal(gsap, q("[data-proof]"), isRtl, { y: 10 }), "-=0.35");
  });

  return (
    <section ref={ref} className="border-b" style={{ borderColor: "var(--rule)" }}>
      <Container className="py-16 sm:py-20 lg:py-24">
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 56,
          }}
        >
          {/* ── The claim ─────────────────────────────────────────────────── */}
          <div>
            <div data-eyebrow data-reveal>
              {/* Gold marker: this is a marketing surface. In the app the same
                  component's marker stays currentColor. */}
              <Eyebrow locale={locale} tone="gold">
                {t("eyebrow")}
              </Eyebrow>
            </div>

            <h1
              data-split
              data-reveal
              className="mt-5"
              style={{
                fontFamily: arabic ? "var(--ar-display)" : "var(--lat-display)",
                fontWeight: arabic ? 700 : 400,
                fontSize: arabic
                  ? "clamp(34px, 4.3vw, 58px)"
                  : "clamp(38px, 4.8vw, 66px)",
                lineHeight: arabic ? 1.34 : 1.06,
                // NEVER on Arabic — it is a connected script and tracking breaks
                // the joins.
                letterSpacing: arabic ? undefined : "var(--lat-display-track)",
                color: "var(--ink)",
              }}
            >
              {t("title")}
            </h1>

            <p
              data-sub
              data-reveal
              className="mt-6 max-w-[46ch]"
              style={{
                fontFamily: arabic ? "var(--ar-body)" : "var(--lat-body)",
                fontSize: 16,
                lineHeight: arabic ? 1.95 : 1.7,
                color: "var(--ink-2)",
              }}
            >
              {t("subtitle")}
            </p>

            {/* The one solid button, and one gold stroke beside it. */}
            <div data-cta data-reveal className="mt-8 flex flex-wrap items-center gap-[9px]">
              <a
                href={registerUrl(locale)}
                className="focus-ledger inline-flex h-[38px] items-center rounded-(--radius-step-md) px-[18px] text-sm font-medium transition-colors hover:bg-ink-2"
                style={{ backgroundColor: "var(--ink)", color: "var(--paper)" }}
              >
                {t("ctaPrimary")}
              </a>
              <Link
                href="/owners"
                className="focus-ledger inline-flex h-[38px] items-center rounded-(--radius-step-md) border px-[18px] text-sm font-medium transition-colors hover:bg-gold-soft"
                style={{ borderColor: "var(--gold)", color: "var(--gold-deep)" }}
              >
                {t("ctaSecondary")}
              </Link>
            </div>

            <div
              data-proof
              data-reveal
              className="mt-8 flex flex-wrap gap-x-10 gap-y-5 border-t pt-6"
              style={{ borderColor: "var(--rule)" }}
            >
              {PROOF.map((key) => (
                <div key={key}>
                  {/* A figure: mono, tabular, Latin digits, bidi-isolated — the
                      same rule the receipt's amounts follow. */}
                  <div
                    className="num ltr-island text-[19px] font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {p(`${key}.figure`)}
                  </div>
                  <div
                    className="mt-[3px] text-[13px]"
                    style={{
                      fontFamily: arabic ? "var(--ar-body)" : "var(--lat-body)",
                      color: "var(--ink-3)",
                    }}
                  >
                    {p(`${key}.label`)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── The proof ─────────────────────────────────────────────────── */}
          <div className="min-h-[460px]">
            <LedgerHero locale={locale} />
          </div>
        </div>
      </Container>
    </section>
  );
}
