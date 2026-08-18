import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Plate } from "@/components/plate";
import { Section, SectionBody, SectionTitle } from "@/components/section";
import { SystemLoop } from "@/components/system-loop";
import { MEDIA } from "@/media/manifest";

export function Counter({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <Section id="counter" label={t.counter.label} locale={locale}>
      <SectionTitle>{t.counter.title}</SectionTitle>
      <SectionBody>{t.counter.body}</SectionBody>

      {/* The two modes ARE a sequence — mode B is mode A plus a second
          check-in — so unlike the settlement bases they take an order marker.
          It is the only place on the page that carries one, which is what
          keeps it meaningful. */}
      <div className="mt-12"><Eyebrow locale={locale} tone="gold">{t.counter.modesLabel}</Eyebrow></div>

      <ol className="mt-5 border-t border-rule">
        {t.counter.modes.map((mode, i) => (
          <li
            key={mode.name}
            className="grid gap-3 border-b border-rule py-6 sm:grid-cols-[2.5rem_12rem_1fr] sm:gap-6"
          >
            <span
              aria-hidden="true"
              className="figure text-[0.8125rem] text-ink-3"
              // The marker is a stage number, and stages start at one.
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="display text-[1.0625rem] leading-snug text-ink">{mode.name}</span>
            <span className="max-w-[56ch] text-[0.9375rem] leading-[1.75] text-ink-2">
              {mode.detail}
            </span>
          </li>
        ))}
      </ol>

      {/* The desk and the thing in the student's hand, side by side. The clip
          is the only moving image on the site and it is here because SPEED is
          this section's only claim, and a still cannot make it. */}
      <div className="mt-14 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] lg:gap-14">
        <SystemLoop
          locale={locale}
          slot={MEDIA.counterBoard}
          caption={t.media.counterBoard}
          reservedLabel={t.media.reserved}
          playLabel={t.media.play}
          pauseLabel={t.media.pause}
        />
        <Plate
          locale={locale}
          slot={MEDIA.studentCard}
          caption={t.media.studentCard}
          reservedLabel={t.media.reserved}
        />
      </div>

      {/* The two claims the modes list makes in words, shown happening.

          The door clip is here rather than beside the board because it IS mode
          two — the second check-in the list describes — and it is done standing
          at a hall door, so it is a phone. The walk-in sits next to it because
          both are the same desk: one registers somebody who has never been
          here, the other confirms somebody who just walked past the counter.

          A phone frame beside a desktop frame is the same pairing the board and
          the card already use above, so this adds no new layout idea. */}
      <div className="mt-14 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] lg:gap-14">
        <SystemLoop
          locale={locale}
          slot={MEDIA.walkInLoop}
          caption={t.media.walkInLoop}
          reservedLabel={t.media.reserved}
          playLabel={t.media.play}
          pauseLabel={t.media.pause}
        />
        <SystemLoop
          locale={locale}
          slot={MEDIA.doorLoop}
          caption={t.media.doorLoop}
          reservedLabel={t.media.reserved}
          playLabel={t.media.play}
          pauseLabel={t.media.pause}
        />
      </div>
    </Section>
  );
}
