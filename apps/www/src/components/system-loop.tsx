"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/i18n/config";
import { hasAsset, type MediaSlot } from "@/media/manifest";
import { Plate } from "./plate";

/**
 * The counter, working — the one clip on this site, because speed is the one
 * claim a still cannot make.
 *
 * Three things it does not do, each deliberate:
 *  - it does not autoplay off screen. A loop needs a job, and a clip nobody
 *    is looking at has none; it pauses the moment it leaves the viewport and
 *    resumes when it returns;
 *  - it does not play under `prefers-reduced-motion`. The poster stands in,
 *    and the control is still there for a reader who wants it;
 *  - it has no sound, ever. `muted` is what lets it autoplay at all, and a
 *    counter clip has nothing to say.
 *
 * Until the file exists this renders the reserved plate, so the layout is
 * already final and dropping the real clip in changes no geometry.
 */
export function SystemLoop({
  slot,
  caption,
  reservedLabel,
  locale,
  playLabel,
  pauseLabel,
}: {
  slot: MediaSlot;
  caption: string;
  locale: Locale;
  reservedLabel: string;
  playLabel: string;
  pauseLabel: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && !calm.matches) void element.play().catch(() => {});
        else element.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(element);

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);

    return () => {
      observer.disconnect();
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
    };
  }, []);

  if (!hasAsset(slot)) {
    return <Plate slot={slot} caption={caption} reservedLabel={reservedLabel} locale={locale} />;
  }

  return (
    <figure className="m-0">
      <div
        className="relative overflow-hidden border border-rule bg-sheet"
        style={{ aspectRatio: String(slot.aspect) }}
      >
        <video
          ref={video}
          className="h-full w-full object-cover"
          src={slot.src!}
          poster={slot.poster ?? undefined}
          muted
          loop
          playsInline
          // `none`, not `metadata`: this sits well below the fold and the
          // observer starts it. Preloading a clip most readers scroll past is
          // bandwidth spent on a market where it is not cheap.
          preload="none"
        />
        <button
          type="button"
          onClick={() => {
            const element = video.current;
            if (!element) return;
            if (element.paused) void element.play().catch(() => {});
            else element.pause();
          }}
          /* `bg-sheet`, NOT `bg-bg`. `--color-bg` is not a token this repo
             defines, and Tailwind emits nothing at all for an undefined
             `--color-*` — so this control sat TRANSPARENT over moving footage,
             with only a hairline border and 13px of `--ink-2` text to read
             against whatever frame happened to be underneath it. It shipped
             because nothing lints a class that silently resolves to nothing.
             `--sheet` is this system's raised ground, which is what the plate
             and the register already sit on. */
          className="tap absolute bottom-3 end-3 inline-flex h-9 items-center border border-rule bg-sheet px-3 text-[0.75rem] text-ink-2 transition-colors hover:border-gold hover:text-ink"
        >
          {playing ? pauseLabel : playLabel}
        </button>
      </div>
      <figcaption className="mt-3 max-w-[46ch] text-[0.8125rem] leading-relaxed text-ink-3">
        {caption}
      </figcaption>
    </figure>
  );
}
