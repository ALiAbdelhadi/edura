"use client";

import { useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion/motion-provider";
import { BrowserFrame } from "./device-frame";
import type { Locale } from "@/lib/i18n";

/**
 * A recorded product flow.
 *
 * THREE THINGS THIS GETS RIGHT THAT AN `<video autoplay loop>` DOES NOT
 * ----------------------------------------------------------------------------
 * 1. **It only plays while visible.** An IntersectionObserver starts and pauses
 *    it, so a page with four clips decodes one, not four. Off-screen video is
 *    the single most expensive thing a marketing page does to a mid-range phone,
 *    and it is invisible in every desktop check.
 *
 * 2. **`preload="none"` until it is near.** The poster carries the scene until
 *    then — ~15 KB instead of ~150 KB, and the bytes are never spent at all for
 *    a reader who does not scroll that far.
 *
 * 3. **Reduced motion does not autoplay.** A looping clip is motion whatever
 *    else it is. Under `prefers-reduced-motion` the poster stands still with a
 *    real play control, so the content is reachable rather than withheld —
 *    silently dropping the video would remove information from exactly the
 *    users who cannot get it another way.
 *
 * The clips carry no audio stream at all (`-an` at encode time), so `muted` here
 * is belt-and-braces rather than the actual guarantee.
 */

type Props = {
  /** Flow key from tools/flows/manifest.ts. */
  flow: string;
  locale: Locale;
  /** Rendered width in CSS px, for the aspect box. */
  width: number;
  alt: string;
  /** Address-bar label. A path, never a fake domain. */
  label?: string;
};

// The recording viewport, from tools/flows/playwright.config.ts. Stated rather
// than measured so the box is reserved before any byte arrives — CLS stays 0.
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
          // `play()` rejects if the browser blocks autoplay. That is a normal
          // outcome, not an error worth surfacing — the poster stays up.
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      // A little margin so the clip is already decoding by the time it lands,
      // but not so much that it starts a screen early.
      { threshold: 0.35, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const video = (
    <div className="relative" style={{ aspectRatio: `${RECORD.width} / ${RECORD.height}` }}>
      <video
        ref={ref}
        // WebP poster rather than AVIF: the `poster` attribute takes a single
        // URL with no content negotiation, so it has to be the format every
        // target browser reads.
        poster={`${stem}.poster.webp`}
        width={width}
        height={height}
        muted
        loop
        playsInline
        // `metadata`, not `auto`: enough to size and seek, none of the payload.
        // The observer flips it when the clip is actually approaching.
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
            className="rounded-[var(--radius-step-md)] px-4 py-2 text-sm font-semibold"
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
