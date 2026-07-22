"use client"

import * as React from "react"

import { cn } from "@repo/ui/lib/utils"
import {
  CLD_PRESETS,
  cldPlaceholder,
  cldSrcSet,
  cldUrl,
  isCloudinaryUrl,
  type CldOptions,
} from "@repo/ui/lib/cloudinary"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar"

/**
 * The image primitives every surface should use for Cloudinary-backed images.
 *
 * A plain <img> (not next/image) on purpose: Cloudinary already does the
 * resizing, format negotiation and CDN caching, so routing the same bytes
 * through Next's optimizer would add a second hop and a second cache for no
 * gain. `loading="lazy"` + `decoding="async"` + an explicit width/height keep
 * the browser-side behaviour that next/image would otherwise provide.
 */

const DEFAULT_WIDTHS = [320, 480, 640, 960, 1280, 1920]

export type CldImageProps = Omit<
  React.ComponentProps<"img">,
  "src" | "srcSet" | "width" | "height"
> & {
  /** A Cloudinary public_id, a stored secure_url, or any external URL. */
  src: string | null | undefined
  width?: number
  height?: number
  /** Transformation overrides merged over the width/height above. */
  transform?: CldOptions
  /** Widths to emit in `srcSet`. Pass `false` to emit a single URL. */
  responsiveWidths?: number[] | false
  /** Show a blurred low-quality stand-in until the real image paints. */
  placeholder?: boolean
  /** Rendered when `src` is empty or the image fails to load. */
  fallback?: React.ReactNode
}

function CldImage({
  src,
  width,
  height,
  transform,
  responsiveWidths,
  placeholder = true,
  fallback = null,
  className,
  sizes,
  alt = "",
  loading = "lazy",
  ...props
}: CldImageProps) {
  // Track WHICH src failed rather than a bare boolean, so a new src clears the
  // failure during render — no effect, no cascading re-render.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  const failed = failedSrc !== null && failedSrc === src

  const options: CldOptions = React.useMemo(
    () => ({ width, height, crop: "fill", gravity: "auto", ...transform }),
    [width, height, transform]
  )

  const url = cldUrl(src, options)
  const srcSet = React.useMemo(() => {
    if (responsiveWidths === false || !url) return undefined
    return cldSrcSet(src, responsiveWidths ?? DEFAULT_WIDTHS, options)
  }, [src, url, responsiveWidths, options])

  const lqip = placeholder && !failed ? cldPlaceholder(src) : null

  if (!url || failed) return <>{fallback}</>

  return (
    <img
      data-slot="cld-image"
      src={url}
      srcSet={srcSet}
      sizes={srcSet ? (sizes ?? "100vw") : undefined}
      width={width}
      height={height}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src ?? null)}
      className={cn("object-cover", className)}
      style={
        lqip
          ? {
              backgroundImage: `url("${lqip}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              ...props.style,
            }
          : props.style
      }
      {...props}
    />
  )
}

/** Initials fallback — "أحمد محمد" → "أم", "Ali Abdelhadi" → "AA". */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "?"
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase()
  return `${(words[0] as string)[0] ?? ""}${(words[1] as string)[0] ?? ""}`.toUpperCase()
}

const AVATAR_PX: Record<"sm" | "default" | "lg" | "xl", number> = {
  sm: 24,
  default: 32,
  lg: 40,
  xl: 96,
}

export type EntityAvatarProps = {
  src?: string | null
  name?: string | null
  size?: "sm" | "default" | "lg" | "xl"
  className?: string
  /** Logos are fitted (never face-cropped) and keep transparency. */
  variant?: "avatar" | "logo"
}

/**
 * Person/center image with an initials fallback. Requests exactly the pixels
 * it renders at 2× DPR — an avatar in a 500-row table costs ~3 KB, not 2 MB.
 */
function EntityAvatar({
  src,
  name,
  size = "default",
  className,
  variant = "avatar",
}: EntityAvatarProps) {
  const px = AVATAR_PX[size]
  const options =
    variant === "logo" ? CLD_PRESETS.logo(px) : CLD_PRESETS.avatar(px)
  const url = cldUrl(src, options)

  return (
    <Avatar
      size={size === "xl" ? "lg" : size}
      // `size-24!` on purpose: Avatar's own `data-[size=lg]:size-10` is a
      // variant selector and out-specifies a plain `size-24`, so xl would
      // silently render at 40px without the important modifier.
      className={cn(size === "xl" && "size-24!", className)}
    >
      {url ? (
        <AvatarImage
          src={url}
          alt={name ?? ""}
          loading="lazy"
          decoding="async"
          className={variant === "logo" ? "object-contain" : "object-cover"}
        />
      ) : null}
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  )
}

export { CldImage, EntityAvatar, initialsOf, isCloudinaryUrl }
