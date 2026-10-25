import Image from "next/image";

import { hasAsset, type MediaSlot } from "@/media/manifest";

// A real screenshot in a quiet frame: 1px rule, sheet mat, no shadow or tilt.
// Video slots show their poster. Renders nothing when the slot has no asset.
export function RoleShot({
  slot,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  slot: MediaSlot | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const src = slot && hasAsset(slot) ? (slot.kind === "video" ? (slot.poster ?? null) : slot.src) : null;
  if (!slot || !src) return null;

  const phone = slot.frame === "phone";

  return (
    <figure className={`rshot ${phone ? "rshot-phone" : ""} ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={phone ? 1170 : 1440}
        height={phone ? 2532 : 900}
        sizes={sizes ?? (phone ? "18rem" : "(min-width: 1024px) 40rem, 100vw")}
        quality={90}
        priority={priority}
        className="rshot-img"
      />
    </figure>
  );
}
