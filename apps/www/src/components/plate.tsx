import Image from "next/image";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";

import { hasAsset, type MediaSlot } from "@/media/manifest";

/**
 * A tipped-in plate.
 *
 * NOT a browser frame. A fake chrome bar with traffic lights puts a browser
 * inside the reader's browser and adds nothing — the reader already knows
 * what a browser looks like. A plate is a ruled edge and a caption, which is
 * how a printed book presents a figure.
 *
 * The box is sized from the manifest's aspect ratio whether or not the file
 * exists, so dropping the real screenshot in later changes pixels and never
 * layout, and never shifts a ScrollTrigger's measured start.
 */
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
  /** Shown inside the reserved plate. Names what will occupy it. */
  reservedLabel: string;
  priority?: boolean;
  className?: string;
}) {
  /* `border-ink`, NOT `border-fg`. `--color-fg` is not a token this repo
     defines — Tailwind emits nothing for an undefined `--color-*`, so the 6px
     bezel had no colour of its own and fell through to the global
     `border-border` hairline value, i.e. a phone frame drawn in 16%-alpha ink.
     `--ink` is the right value and it flips with the theme, which is what a
     device bezel should do: near-black on paper, near-white on dark. */
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
            // 90, not the default 75. See the note in next.config.ts: a plate
            // is a screenshot of type and hairlines, and 75 is a photographic
            // setting that softens exactly those.
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

/**
 * The held-open space.
 *
 * Pre-ruled paper with the plate's name and its intended size in the margin —
 * the page's own material, not a placeholder graphic. It is legible enough to
 * review the composition against, and unmistakably not a screenshot, so no
 * reviewer ever mistakes it for shipped imagery.
 */
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
      {/* The ruling. `repeating-linear-gradient` costs no elements and no
          layout, and it is the same hairline colour every rule on this page
          uses. */}
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
