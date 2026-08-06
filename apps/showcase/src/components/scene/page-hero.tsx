"use client";

import { Container } from "@/components/kit/container";
import type { Locale } from "@/lib/i18n";
import { reveal, unhide } from "@/lib/motion/reveal";
import { DURATION } from "@/lib/motion/runtime";
import { splitHeadline } from "@/lib/motion/split-text";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  body,
  media,
  tone = "--indigo",
}: {
  eyebrow: string;
  title: string;
  body: string;
  media?: ReactNode;
  tone?: string;
}) {
  const locale = useLocale() as Locale;

  const ref = useScene(({ q, isRtl, gsap, SplitText }) => {
    const heading = q("[data-split]")[0];
    const tl = gsap.timeline();

    tl.add(reveal(gsap, q("[data-eyebrow]"), isRtl, { x: 12, from: "start" }));

    if (heading) {
      const split = splitHeadline(SplitText, heading, { mask: true });
      unhide(gsap, heading);
      tl.from(
        split.targets,
        { yPercent: 110, duration: DURATION.slow, stagger: 0.045 },
        "-=0.35",
      );
    }

    tl.add(reveal(gsap, q("[data-sub]"), isRtl, { y: 14 }), "-=0.5")
      .add(reveal(gsap, q("[data-media]"), isRtl, { y: 20 }), "-=0.45");
  });

  return (
    <section ref={ref} className="border-b" style={{ borderColor: "var(--rule)" }}>
      <Container className="py-16 sm:py-20 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="max-w-2xl">
            <div data-eyebrow data-reveal className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-block h-5 w-0.75 rounded-full"
                style={{ backgroundColor: `var(${tone})` }}
              />
              <Eyebrow locale={locale}>{eyebrow}</Eyebrow>
            </div>
            <h1
              data-split
              data-reveal
              className="mt-5 text-3xl font-extrabold leading-[1.18] sm:text-4xl lg:text-5xl"
              style={{ color: "var(--ink)" }}
            >
              {title}
            </h1>
            <p
              data-sub
              data-reveal
              className="mt-5 max-w-xl text-lg leading-relaxed"
              style={{ color: "var(--ink-2)" }}
            >
              {body}
            </p>
          </div>
          {media ? (
            <div data-media data-reveal>
              {media}
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
