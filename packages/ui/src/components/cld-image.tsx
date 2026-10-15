"use client"

import * as React from "react"

import { cn } from "@repo/ui/lib/utils"
import {
  MEDIA_PRESETS,
  mediaPlaceholder,
  mediaSrcSet,
  mediaUrl,
  isMediaDeliveryUrl,
  type MediaOptions,
} from "@repo/ui/lib/media"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar"

const DEFAULT_WIDTHS = [320, 480, 640, 960, 1280, 1920]

export type CldImageProps = Omit<
  React.ComponentProps<"img">,
  "src" | "srcSet" | "width" | "height"
> & {
  src: string | null | undefined
  width?: number
  height?: number
  transform?: MediaOptions
  responsiveWidths?: number[] | false
  placeholder?: boolean
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
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  const failed = failedSrc !== null && failedSrc === src

  const options: MediaOptions = React.useMemo(
    () => ({ width, height, crop: "fill", gravity: "auto", ...transform }),
    [width, height, transform]
  )

  const url = mediaUrl(src, options)
  const srcSet = React.useMemo(() => {
    if (responsiveWidths === false || !url) return undefined
    return mediaSrcSet(src, responsiveWidths ?? DEFAULT_WIDTHS, options)
  }, [src, url, responsiveWidths, options])

  const lqip = placeholder && !failed ? mediaPlaceholder(src) : null

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
  variant?: "avatar" | "logo"
}

function EntityAvatar({
  src,
  name,
  size = "default",
  className,
  variant = "avatar",
}: EntityAvatarProps) {
  const px = AVATAR_PX[size]
  const options =
    variant === "logo" ? MEDIA_PRESETS.logo(px) : MEDIA_PRESETS.avatar(px)
  const url = mediaUrl(src, options)

  return (
    <Avatar
      size={size === "xl" ? "lg" : size}
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

export { CldImage, EntityAvatar, initialsOf, isMediaDeliveryUrl as isCloudinaryUrl }
