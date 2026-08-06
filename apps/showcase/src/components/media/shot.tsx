import type { Locale } from "@/lib/i18n";
import { BrowserFrame, PhoneFrame } from "./device-frame";

type Role = "admin" | "staff" | "teacher" | "assistant" | "student" | "parent";

export type ShotProps = {
  role: Role;
  screen: string;
  locale: Locale;
  width: number;
  alt: string;
  frame?: "browser" | "phone" | "none";
  label?: string;
  priority?: boolean;
};

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
