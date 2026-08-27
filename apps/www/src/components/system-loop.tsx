"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/i18n/config";
import { hasAsset, type MediaSlot } from "@/media/manifest";
import { Plate } from "./plate";

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
