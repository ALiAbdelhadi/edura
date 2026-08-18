import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { appUrl } from "@/lib/app-origin";
import { Button } from "@repo/ui/components/button";

import { Ink } from "@/components/ink";

/**
 * The only place on the page where the accent becomes an object.
 *
 * A ledger page is closed with a stamp, so the page is too — and the seal is
 * the single most saturated thing here, which is what buys every other
 * surface the right to be ink on paper. It is INKED and then PRESSED: the
 * rings and the mark draw along their own strokes, then the whole stamp lands
 * slightly hard and settles into the tilt the CSS already holds. A stamp is
 * struck once; it does not fade up.
 */
export function Closing({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <section id="closing" className="border-t border-rule">
      {/* Capped tighter than the hero. The seal is an object the closing line
          is addressed to; parked at the far edge of a 1400px container it
          stops belonging to the sentence. */}
      <div className="mx-auto w-full max-w-[72rem] px-6 py-14 md:px-10 md:py-24 lg:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20">
          <div>
            {/* The second and last line on this page that animates — the book
                closing, answering the headline that opened it. */}
            <Ink
              as="h2"
              text={t.closing.title}
              className="display max-w-[14ch] text-[clamp(2rem,1.3rem+2.8vw,3.25rem)] leading-[1.2] text-ink"
            />
            <p className="mt-5 max-w-[48ch] text-[1.0625rem] leading-[1.75] text-ink-2">
              {t.closing.body}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild variant="ledger" size="ledger" className="tap">
                <a href={appUrl(locale, "/register?role=center_admin")}>{t.closing.primary}</a>
              </Button>
              <Button asChild variant="gold" size="ledger" className="tap">
                <a href={appUrl(locale, "/register?role=teacher")}>{t.closing.secondary}</a>
              </Button>
            </div>
          </div>

          <div className="seal-mark justify-self-center lg:justify-self-end" data-seal="">
            <Seal top={t.closing.sealTop} bottom={t.closing.sealBottom} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Seal({ top, bottom }: { top: string; bottom: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={`${top} — ${bottom}`}
      className="h-40 w-40 text-seal sm:h-48 sm:w-48"
      fill="none"
      stroke="currentColor"
    >
      <defs>
        {/* ONE arc, along the top only. A second arc along the bottom is the
            obvious symmetry and it does not survive contact with either
            script: glyphs tangent to a downward curve render inverted, and
            the fix (reversing the path) reverses the reading order too. The
            lower label is set straight instead, which is what an Egyptian
            office stamp does anyway. */}
        <path id="seal-arc-top" d="M 36 100 A 64 64 0 0 1 164 100" />
      </defs>

      {/* `data-seal-stroke` marks a stroke the page inks along its own length.
          Order matters: the rings first, then the mark inside them, which is
          the order a die is cut and the order a reader's eye accepts. */}
      <circle data-seal-stroke="" cx="100" cy="100" r="88" strokeWidth="1" opacity="0.45" />
      <circle data-seal-stroke="" cx="100" cy="100" r="80" strokeWidth="2.5" />

      {/* The engraved book at the centre — the same mark the nav carries,
          drawn once more at seal scale rather than a second device. */}
      <g
        transform="translate(74 82) scale(1.6)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          data-seal-stroke=""
          d="M16 5.4C13.4 3.5 10.1 2.6 6.2 2.9c-.7.1-1.2.6-1.2 1.3v13.6c0 .8.6 1.4 1.4 1.3 3.6-.3 6.8.5 9.6 2.4"
        />
        <path
          data-seal-stroke=""
          d="M16 5.4c2.6-1.9 5.9-2.8 9.8-2.5.7.1 1.2.6 1.2 1.3v13.6c0 .8-.6 1.4-1.4 1.3-3.6-.3-6.8.5-9.6 2.4"
        />
        <path data-seal-stroke="" d="M16 5.4v16.1" />
      </g>

      <path data-seal-stroke="" d="M 74 132 H 126" strokeWidth="1" opacity="0.6" />

      {/* Type is set, not drawn. Inking a letterform along its outline is a
          different craft from striking a die, and faking it on Arabic
          shaping is not a thing to attempt. It arrives with the press. */}
      <g fill="currentColor" stroke="none">
        <text data-seal-text="" className="font-ar-display text-[15px] font-bold" textAnchor="middle">
          <textPath href="#seal-arc-top" startOffset="50%">
            {top}
          </textPath>
        </text>
        <text
          data-seal-text=""
          x="100"
          y="150"
          textAnchor="middle"
          className="font-ar-display text-[12px] font-bold"
        >
          {bottom}
        </text>
      </g>
    </svg>
  );
}
