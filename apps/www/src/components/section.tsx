import type { ReactNode } from "react";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";

/**
 * A section is a ROW IN THE REGISTER, not a card.
 *
 * Every section carries its account label in a narrow column at the inline
 * start, and the label sticks while its rows scroll past — the way a ledger
 * keeps the account name beside the entries it owns. The hairline at the top
 * is the register's ruling, so sections read as one continuous book rather
 * than as a stack of floating panels.
 *
 * الكعب — THE SPINE runs down the binding edge of every section, and scroll
 * is what draws it. Because sections stack with no gap, the segments meet and
 * read as one line down the whole book. It exists only at `lg`: below that
 * there is no margin column for a binding edge to be, and a spine drawn
 * through the text would be decoration rather than structure.
 */
export function Section({
  id,
  label,
  locale,
  children,
}: {
  id: string;
  label: string;
  /** The eyebrow picks its script from the locale, never from a caller flag —
   *  so a screen cannot apply the Latin recipe (uppercase, tracking, mono) to
   *  an Arabic string, which is unreadable in a connected script. */
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-rule">
      <div className="relative mx-auto w-full max-w-[87.5rem] px-6 py-12 md:px-10 md:py-20 lg:py-28">
        {/* Decorative, and therefore allowed to start at zero length: it
            carries no information a reader would lose if a script failed.
            Content on this page never starts hidden. */}
        <span
          data-spine=""
          aria-hidden="true"
          className="spine absolute inset-y-0 start-6 hidden w-px bg-rule lg:block"
        />

        <div className="grid gap-10 lg:grid-cols-[9rem_1fr] lg:gap-16">
          <div className="relative lg:sticky lg:top-28 lg:self-start lg:ps-8">
            {/* The tick that joins the spine to the account it names. */}
            <span
              data-section-tick=""
              aria-hidden="true"
              className="tick draw-inline absolute top-[0.55rem] start-2 hidden h-px w-4 bg-gold lg:block"
            />
            {/* `tone="gold"` is the system's own MARKETING form: the brand
                accent appears as a 2px stroke on the marker and nowhere else
                on the surface. The label itself never turns gold — `--gold`
                does not hold 4.5:1 at text sizes, which is what `--gold-deep`
                exists for. */}
            <Eyebrow locale={locale} tone="gold">
              {label}
            </Eyebrow>
          </div>

          {/* Capped, and the cap is load-bearing. Without it the register rows
              stretch to the full 1400px container and the money column ends up
              a quarter of a screen away from the text it belongs to — the
              figure stops reading as part of its row. */}
          <div className="min-w-0 max-w-[62rem]">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** The one heading size sections share, so no section outranks another. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="display max-w-[22ch] text-[clamp(1.75rem,1.1rem+2.4vw,2.75rem)] leading-[1.25] text-ink">
      {children}
    </h2>
  );
}

export function SectionBody({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 max-w-[58ch] text-[1.0625rem] leading-[1.75] text-ink-2">{children}</p>
  );
}
