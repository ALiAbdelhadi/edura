"use client";

import { Container } from "@/components/kit/container";
import type { Locale } from "@/lib/i18n";
import { revealOnScroll } from "@/lib/motion/reveal";
import { useScene } from "@/lib/motion/use-scene";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

export function Scene({
  id,
  eyebrow,
  title,
  body,
  media,
  order = "media-last",
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