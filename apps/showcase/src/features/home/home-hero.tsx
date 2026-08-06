"use client";

import { Container } from "@/components/kit/container";
import { Link } from "@/i18n/navigation";
import { registerUrl } from "@/lib/app-links";
import type { Locale } from "@/lib/i18n";
import { reveal, unhide } from "@/lib/motion/reveal";
import { DURATION, EASE } from "@/lib/motion/runtime";
import { splitHeadline } from "@/lib/motion/split-text";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale, useTranslations } from "next-intl";

export function HomeHero() {
  const t = useTranslations("home.hero");
  const locale = useLocale() as Locale;

  const ref = useScene(({ q, isRtl, gsap, SplitText }) => {
    const heading = q("[data-split]")[0];
    if (!heading) return;

    const split = splitHeadline(SplitText, heading, { mask: true });

    unhide(gsap, heading);

    const tl = gsap.timeline({ defaults: { ease: EASE.play } });

    tl.add(
      reveal(gsap, q("[data-eyebrow]"), isRtl, { x: 12, from: "start" }),
    )
      .from(
        split.targets,
        { yPercent: 110, duration: DURATION.slow, stagger: 0.045 },
        "-=0.35",
      )
      .add(reveal(gsap, q("[data-sub]"), isRtl, { y: 12 }), "-=0.55")
      .add(reveal(gsap, q("[data-cta]"), isRtl, { y: 10 }), "-=0.4");
  });

  return (
    <section
      ref={ref}
      className="border-b"
      style={{ borderColor: "var(--rule)" }}
    >
      <Container className="py-20 sm:py-28 lg:py-36">
        <div className="max-w-3xl">
          <div data-eyebrow data-reveal>
            <Eyebrow locale={locale}>{t("eyebrow")}</Eyebrow>
          </div>

          <h1
            data-split
            data-reveal
            className="mt-5 text-4xl font-extrabold leading-[1.15] sm:text-5xl lg:text-6xl"
            style={{ color: "var(--ink)" }}
          >
            {t("title")}
          </h1>

          <p
            data-sub
            data-reveal
            className="mt-6 max-w-xl text-lg leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            {t("subtitle")}
          </p>

          <div data-cta data-reveal className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={registerUrl(locale)}
              className="focus-ledger inline-flex h-11 items-center rounded-(--radius-step-md) px-5 text-sm font-semibold"
              style={{
                backgroundColor: "var(--indigo)",
                color: "var(--indigo-ink)",
              }}
            >
              {t("ctaPrimary")}
            </a>
            <Link
              href="/owners"
              className="focus-ledger inline-flex h-11 items-center rounded-(--radius-step-md) border px-5 text-sm font-semibold"
              style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
