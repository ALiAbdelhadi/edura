import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import type { Group } from "@/i18n/roles";
import { MEDIA } from "@/media/manifest";
import { Plate } from "./plate";

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
  const plateFirst = index % 2 === 1;

  return (
    <div className="border-t border-rule py-10 lg:py-14">
      <Eyebrow locale={locale} tone="gold">
        {group.label}
      </Eyebrow>

      <div
        className={`mt-6 grid gap-10 lg:gap-14 ${
          shot
            ? // A phone plate is 390×844 — more than twice as tall as it is
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
