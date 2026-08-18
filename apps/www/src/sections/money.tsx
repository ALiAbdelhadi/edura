import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { StatusBadge } from "@repo/ui/components/status-badge";

import { Figure } from "@/components/figure";
import { Plate } from "@/components/plate";
import { Section, SectionBody, SectionTitle } from "@/components/section";
import { SystemLoop } from "@/components/system-loop";
import { MEDIA } from "@/media/manifest";

export function Money({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <Section id="money" label={t.money.label} locale={locale}>
      <SectionTitle>{t.money.title}</SectionTitle>
      <SectionBody>{t.money.body}</SectionBody>

      {/* The three bases are ALTERNATIVES, not a sequence — so they carry no
          01/02/03. A numbered marker would assert an order the content does
          not have.

          They DO carry the money column, because the section's actual claim is
          that the basis changes what a lesson is worth. Two of the figures
          disagree on purpose; the third is deliberately not a figure at all,
          which is the honest answer for a per-student basis and makes the
          point better than an averaged number would. */}
      <div className="mt-14">
        <Eyebrow locale={locale} tone="gold">{t.money.basesLabel}</Eyebrow>
        <p className="mt-3 max-w-[56ch] text-[0.875rem] leading-[1.7] text-ink-3">
          {t.money.basesExample}
        </p>

        <dl className="mt-5 border-t border-rule">
          {t.money.bases.map((basis) => (
            <div
              key={basis.name}
              className="grid grid-cols-[1fr_auto] items-stretch gap-x-6 gap-y-2 border-b border-rule py-5 sm:grid-cols-[11rem_1fr_auto] sm:gap-x-8"
            >
              <dt className="display flex flex-wrap items-center gap-2 text-[1.125rem] leading-snug text-ink">
                {basis.name}
                {/* A real state, so it takes the system's badge for one rather
                    than a sentence. `active` is the indigo tone — brand /
                    in-force — which is exactly what "the default" means here. */}
                {basis.isDefault ? (
                  <StatusBadge tone="active">{t.money.defaultBadge}</StatusBadge>
                ) : null}
              </dt>
              <dd className="col-span-2 max-w-[46ch] text-[0.9375rem] leading-[1.7] text-ink-2 sm:col-span-1">
                {basis.detail}
              </dd>
              {/* `items-stretch` + this cell filling its row is what makes the
                  khana read as one continuous rule down the list rather than
                  as three floating dashes. */}
              <div className="khana col-start-2 row-start-1 flex w-[7.5rem] items-center justify-end ps-5 sm:col-start-3 sm:w-[9rem] sm:ps-8">
                {basis.value ? (
                  <Figure value={basis.value} currency={t.register.currency} post />
                ) : (
                  <span className="text-[0.8125rem] text-ink-3">{basis.valueNote}</span>
                )}
              </div>
            </div>
          ))}
        </dl>

        <p className="mt-4 max-w-[62ch] text-[0.8125rem] leading-[1.7] text-ink-3">
          {t.money.basesFootnote}
        </p>
      </div>

      {/* The guard is the one claim on this page that is a refusal rather than
          a feature, so it is the one block that sits on a raised sheet.

          The confirm screen sits beside it deliberately: the section's whole
          argument is that the quoted split and the written split are one
          function, and this is the screen where a reader can check it. */}
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-14">
        <div className="border border-rule bg-sheet p-6 sm:p-8">
          <h3 className="display text-[1.25rem] leading-snug text-ink">
            {t.money.guard.title}
          </h3>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-[1.75] text-ink-2">
            {t.money.guard.body}
          </p>
        </div>

        <Plate
          locale={locale}
          slot={MEDIA.settlementConfirm}
          caption={t.media.settlementConfirm}
          reservedLabel={t.media.reserved}
        />
      </div>

      {/* THE SPLIT ARRIVING, not the split existing.
          The confirm plate above proves the figures; this proves the ORDER —
          the teacher marks the room, saves, and the arithmetic appears while
          the confirm button is still unpressed. That sequence is the section's
          actual claim and it is the one part of it a still cannot carry, which
          is the only bar a moving image on this page has to clear. */}
      <div className="mt-12">
        <SystemLoop
          locale={locale}
          slot={MEDIA.settlementLoop}
          caption={t.media.settlementLoop}
          reservedLabel={t.media.reserved}
          playLabel={t.media.play}
          pauseLabel={t.media.pause}
        />
      </div>

      <div className="mt-12">
        <Eyebrow locale={locale} tone="gold">{t.money.rails.title}</Eyebrow>
        <div className="mt-5 grid gap-x-10 gap-y-5 border-t border-rule pt-5 sm:grid-cols-2">
          <p className="max-w-[46ch] text-[0.9375rem] leading-[1.7] text-ink-2">
            {t.money.rails.online}
          </p>
          <p className="max-w-[46ch] text-[0.9375rem] leading-[1.7] text-ink-2 sm:border-s sm:border-rule sm:ps-10">
            {t.money.rails.cash}
          </p>
        </div>
      </div>
    </Section>
  );
}
