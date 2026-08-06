"use client";

import { useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion/motion-provider";
import { BrowserFrame } from "./device-frame";
import type { Locale } from "@/lib/i18n";


type Props = {
  flow: string;
  locale: Locale;
  width: number;
  alt: string;
  label?: string;
};

const RECORD = { width: 1280, height: 800 };

export function FlowVideo({ flow, locale, width, alt, label }: Props) {
  const { reduced } = useMotion();
  const ref = useRef<HTMLVideoElement | null>(null);
  const [manualPlay, setManualPlay] = useState(false);

  const stem = `/flows/${flow}.${locale}`;
  const height = Math.round((width * RECORD.height) / RECORD.width);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.35, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const video = (
    <div className="relative" style={{ aspectRatio: `${RECORD.width} / ${RECORD.height}` }}>
      <video
        ref={ref}
        poster={`${stem}.poster.webp`}
        width={width}
        height={height}
        muted
        loop
        playsInline
        preload={reduced ? "none" : "metadata"}
        controls={reduced && manualPlay}
        aria-label={alt}
        className="block h-full w-full object-cover"
      >
        <source src={`${stem}.webm`} type="video/webm" />
        <source src={`${stem}.mp4`} type="video/mp4" />
      </video>

      {reduced && !manualPlay ? (
        <button
          type="button"
          onClick={() => {
            setManualPlay(true);
            void ref.current?.play().catch(() => {});
          }}
          className="focus-ledger absolute inset-0 grid place-items-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--paper) 55%, transparent)" }}
        >
          <span
            className="rounded-(--radius-step-md) px-4 py-2 text-sm font-semibold"
            style={{
              backgroundColor: "var(--indigo)",
              color: "var(--indigo-ink)",
              boxShadow: "var(--lift)",
            }}
          >
            {locale === "ar" ? "شغّل الفيديو" : "Play video"}
          </span>
        </button>
      ) : null}
    </div>
  );

  return <BrowserFrame label={label}>{video}</BrowserFrame>;
}
