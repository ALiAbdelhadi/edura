import Image from "next/image";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";

import { hasAsset, type MediaSlot } from "@/media/manifest";

export function Plate({
  slot,
  caption,
  reservedLabel,
  locale,
  priority = false,
  className = "",
}: {
  slot: MediaSlot;
  caption: string;
  locale: Locale;
  reservedLabel: string;
  priority?: boolean;
  className?: string;
}) {
  const frame =
    slot.frame === "phone"
      ? "rounded-[1.75rem] border-[6px] border-ink p-0"
      : "border border-rule";

  return (
    <figure className={`m-0 ${className}`}>
      <div
        className={`relative overflow-hidden bg-sheet ${frame}`}
        style={{ aspectRatio: String(slot.aspect) }}
      >
        {hasAsset(slot) ? (
          <Image
            src={slot.src!}
            alt={caption}
            fill
            sizes="(min-width: 1024px) 45vw, 100vw"
            quality={90}
            className="object-cover"
            priority={priority}
          />
        ) : (
          <ReservedPlate label={reservedLabel} slot={slot} locale={locale} />
        )}
      </div>

      <figcaption className="mt-3 max-w-[46ch] text-[0.8125rem] leading-relaxed text-ink-3">
        {caption}
      </figcaption>
    </figure>
  );
}

function ReservedPlate({
  label,
  slot,
  locale,
}: {
  label: string;
  slot: MediaSlot;
  locale: Locale;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, var(--rule) 27px, var(--rule) 28px)",
        }}
      />
      <div className="relative px-6 text-center">
        <Eyebrow locale={locale} tone="gold">{label}</Eyebrow>
        <p className="figure mt-2 text-[0.75rem] text-ink-3">
          {slot.capture.width}×{slot.capture.height}
          {slot.kind === "video" ? " · loop" : ""}
        </p>
      </div>
    </div>
  );
}
