import { BrowserFrame, PhoneFrame } from "./device-frame";
import type { Locale } from "@/lib/i18n";

/**
 * A captured product screenshot, presented honestly.
 *
 * WHY A <picture> AND NOT next/image
 * ----------------------------------------------------------------------------
 * The assets under `public/shots/**\/opt/` are ALREADY the optimised output:
 * `tools/optimize-shots.ts` encodes AVIF + WebP at 1440 and 720 from the 2×
 * PNG. Passing them through next/image would re-encode an already-lossy file
 * at request time — worse pixels, more work, no smaller. A `<picture>` lets
 * the browser pick the format and width directly, which is all next/image
 * would have been doing.
 *
 * `loading="lazy"` + explicit `width`/`height` are what keep CLS at 0: the box
 * is reserved before the bytes arrive. Every scene below the fold depends on
 * this, so the dimensions are required props rather than optional hints.
 *
 * LOCALE IS NOT DECORATION. A screenshot is a claim about what the product
 * looks like to THIS reader, so the Arabic page shows the Arabic capture. A
 * marketing site that shows an English UI to an Arabic reader is advertising a
 * product they will not receive.
 */

type Role = "admin" | "staff" | "teacher" | "assistant" | "student" | "parent";

export type ShotProps = {
  role: Role;
  /** File stem from tools/capture/screens.ts. */
  screen: string;
  locale: Locale;
  /** Rendered width in CSS px. Picks the 720 asset at or below 720. */
  width: number;
  /** Alt text. Describe what the screen SHOWS, not that it is a screenshot. */
  alt: string;
  frame?: "browser" | "phone" | "none";
  /** Address-bar label for the browser frame. A path, never a fake domain. */
  label?: string;
  priority?: boolean;
};

// The capture viewports, from tools/capture/playwright.config.ts. Aspect ratio
// is fixed there, so it is stated once here rather than measured per image —
// which is what lets `height` be computed and CLS stay at 0.
const CAPTURE = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export function Shot({
  role,
  screen,
  locale,
  width,
  alt,
  frame = "browser",
  label,
  priority = false,
}: ShotProps) {
  // A phone frame gets the MOBILE capture, not the desktop one scaled down.
  // Student, parent and staff portals switch to bottom navigation below the
  // breakpoint (CONSTITUTION.md §4), so a desktop shot inside a phone bezel
  // would advertise a layout those users never see. `frame` is therefore what
  // selects the source, not just the chrome around it.
  const device = frame === "phone" ? "mobile" : "desktop";
  const suffix = device === "mobile" ? ".mobile" : "";
  const stem = `/shots/${role}/opt/${screen}.${locale}${suffix}`;
  const asset = width <= 720 ? 720 : 1440;
  const { width: cw, height: ch } = CAPTURE[device];
  const height = Math.round((width * ch) / cw);

  const img = (
    <picture>
      <source srcSet={`${stem}.${asset}.avif`} type="image/avif" />
      <source srcSet={`${stem}.${asset}.webp`} type="image/webp" />
      <img
        src={`${stem}.${asset}.webp`}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        className="block h-auto w-full"
      />
    </picture>
  );

  if (frame === "none") return img;
  if (frame === "phone") return <PhoneFrame>{img}</PhoneFrame>;
  return <BrowserFrame label={label}>{img}</BrowserFrame>;
}
