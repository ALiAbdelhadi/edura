import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import type { Group } from "@/i18n/roles";
import { MEDIA } from "@/media/manifest";
import { Plate } from "./plate";

/**
 * One group of capabilities, laid out as a register beside its plate.
 *
 * The group heading is the PORTAL SIDEBAR'S OWN, and so is every capability
 * name under it. That is the whole discipline of these pages: a reader who
 * signs up finds the same nouns in the same groups. Renaming the product's
 * screens for marketing teaches a vocabulary the product then contradicts.
 *
 * The plate is per GROUP, not per capability — nineteen screenshots down a
 * center's page is nineteen things nobody looks at.
 */
export function CapabilityGroup({
  group,
  locale,
  reservedLabel,
  index,
}: {
  group: Group;
  locale: Locale;
  reservedLabel: string;
  index: number;
}) {
  const shot = group.shot ? MEDIA[group.shot] : null;
  // Alternate which side the plate sits on so a page of five groups does not
  // read as one column with a stripe of images beside it. In RTL the whole
  // grid mirrors anyway; this only alternates WITHIN that.
  const plateFirst = index % 2 === 1;

  return (
    <div className="border-t border-rule py-10 lg:py-14">
      <Eyebrow locale={locale} tone="gold">
        {group.label}
      </Eyebrow>

      {/* Alternating the plate's `order` alone was a bug: order moves an item
          between grid CELLS, but the column WIDTHS stay put — so on every
          other group the plate landed in the 1fr column and the capability
          list was squeezed into 24rem, two words to a line. The TEMPLATE has
          to flip with it. */}
      <div
        className={`mt-6 grid gap-10 lg:gap-14 ${
          shot
            ? // A phone plate is 390×844 — more than twice as tall as it is
              // wide. Given the same 24rem column a desktop shot gets, it runs
              // 500px past the end of its own capability list and leaves a
              // column of empty page beside it. Narrower column, same object.
              shot.frame === "phone"
              ? plateFirst
                ? "lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
                : "lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]"
              : plateFirst
                ? "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
                : "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
            : ""
        }`}
      >
        <dl className={`min-w-0 ${plateFirst && shot ? "lg:order-2" : ""}`}>
          {group.capabilities.map((capability) => (
            <div
              key={capability.name}
              className="grid gap-1.5 border-b border-rule py-5 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-8"
            >
              <dt className="display text-[1.0625rem] leading-snug text-ink">{capability.name}</dt>
              <dd className="max-w-[62ch] text-[0.9375rem] leading-[1.7] text-ink-2">
                {capability.detail}
              </dd>
            </div>
          ))}
        </dl>

        {shot ? (
          <div className={`lg:sticky lg:top-28 lg:self-start ${plateFirst ? "lg:order-1" : ""}`}>
            <Plate
              slot={shot}
              caption={group.label}
              reservedLabel={`${reservedLabel} · ${group.label}`}
              locale={locale}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
