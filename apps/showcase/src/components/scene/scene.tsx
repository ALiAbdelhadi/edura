"use client";

import { Container } from "@/components/kit/container";
import { revealOnScroll } from "@/lib/motion/reveal";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * One scroll scene: an eyebrow, a headline, a body line, and its media.
 *
 * Every scene on every role page is this component. That is deliberate — five
 * pages hand-composing their own section markup is five places for the rhythm,
 * the reveal and the RTL handling to drift apart, and the drift would show up
 * as "this page feels different" long before anyone could name why.
 *
 * The reveal is `revealOnScroll`, so each scene animates when it ARRIVES rather
 * than all at once on load, and does nothing at all under reduced motion.
 */
export function Scene({
  id,
  eyebrow,
  title,
  body,
  media,
  /** Media first (default) or after the copy. Alternates down a page. */
  order = "media-last",
  /** A wide scene drops the two-column layout and lets the media run full width. */
  wide = false,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  body?: string;
  media?: ReactNode;
  order?: "media-first" | "media-last";
  wide?: boolean;
}) {
  const locale = useLocale() as Locale;

  const ref = useScene(({ q, isRtl, gsap }) => {
    const targets = q("[data-reveal]");
    if (targets.length) revealOnScroll(gsap, targets, isRtl, { y: 18, stagger: 0.08 });
  });

  const copy = (
    <div data-reveal className={wide ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <Eyebrow locale={locale}>{eyebrow}</Eyebrow>
      <h2
        className="mt-4 text-2xl font-extrabold leading-snug sm:text-3xl"
        style={{ color: "var(--ink)" }}
      >
        {title}
      </h2>
      {body ? (
        <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {body}
        </p>
      ) : null}
    </div>
  );

  return (
    <section
      id={id}
      ref={ref}
      // `scroll-mt` so the sticky sub-nav does not cover the heading when a
      // reader jumps to this scene by anchor.
      className="scroll-mt-28 border-b py-16 sm:py-24"
      style={{ borderColor: "var(--rule)" }}
    >
      <Container>
        {wide ? (
          <>
            {copy}
            {media ? (
              <div data-reveal className="mt-10">
                {media}
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            {order === "media-first" ? (
              <>
                {media ? <div data-reveal>{media}</div> : null}
                {copy}
              </>
            ) : (
              <>
                {copy}
                {media ? <div data-reveal>{media}</div> : null}
              </>
            )}
          </div>
        )}
      </Container>
    </section>
  );
}
