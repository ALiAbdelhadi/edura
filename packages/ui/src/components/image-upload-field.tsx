"use client"

import * as React from "react"
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"
import { Button } from "@repo/ui/components/button"
import { CldImage, EntityAvatar } from "@repo/ui/components/cld-image"
import { compressImage, formatBytes } from "@repo/ui/lib/image-compress"

/**
 * One image-upload control for every surface (center logo, teacher photo,
 * covers, gallery items).
 *
 * It owns the parts that are easy to get wrong and tedious to repeat:
 * drag-and-drop, an instant local preview, client-side downscaling before the
 * request, size/type pre-checks, and the busy/error states. It owns NO
 * transport — the caller passes `onUpload`, so ownership checks and the API
 * shape stay where they belong.
 *
 * @repo/ui carries no i18n, so every user-visible string is a prop; the app
 * passes translated text in.
 */

const ACCEPTED = "image/jpeg,image/png,image/webp,image/avif"
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

export type ImageUploadFieldProps = {
  /** Currently stored image (public_id or URL). */
  value?: string | null
  /** Receives the compressed File. Should resolve once the server has stored it. */
  onUpload: (file: File) => Promise<void> | void
  onRemove?: () => Promise<void> | void
  /** `avatar` = round face-aware preview, `logo` = fitted, `cover` = 16:9 box. */
  variant?: "avatar" | "logo" | "cover"
  /** Used for the initials fallback in avatar/logo variants. */
  name?: string | null
  disabled?: boolean
  maxBytes?: number
  /** Longest edge after client-side downscale. */
  maxEdge?: number
  className?: string
  labels?: Partial<{
    upload: string
    replace: string
    remove: string
    uploading: string
    dropHint: string
    tooLarge: string
    wrongType: string
    failed: string
  }>
}

const DEFAULT_LABELS = {
  upload: "Upload image",
  replace: "Replace",
  remove: "Remove",
  uploading: "Uploading…",
  dropHint: "PNG, JPG or WebP — up to 5 MB",
  tooLarge: "Image is too large",
  wrongType: "Only PNG, JPG, WebP or AVIF images are accepted",
  failed: "Upload failed. Please try again.",
}

function ImageUploadField({
  value,
  onUpload,
  onRemove,
  variant = "avatar",
  name,
  disabled = false,
  maxBytes = DEFAULT_MAX_BYTES,
  maxEdge = 1600,
  className,
  labels,
}: ImageUploadFieldProps) {
  const t = { ...DEFAULT_LABELS, ...labels }
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  // Local object URL so the preview updates the instant a file is picked,
  // before the round-trip finishes.
  const [preview, setPreview] = React.useState<string | null>(null)

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const shown = preview ?? value ?? null

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null)
      if (!file.type.startsWith("image/")) {
        setError(t.wrongType)
        return
      }
      if (file.size > maxBytes * 4) {
        // Guard before decoding: a 100 MB file should not hit the canvas at all.
        setError(`${t.tooLarge} (${formatBytes(file.size)})`)
        return
      }

      setBusy(true)
      const objectUrl = URL.createObjectURL(file)
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return objectUrl
      })

      try {
        const compressed = await compressImage(file, { maxEdge })
        if (compressed.size > maxBytes) {
          setError(`${t.tooLarge} (${formatBytes(compressed.size)})`)
          return
        }
        await onUpload(compressed)
        // The parent has refetched by now; drop the local preview so the
        // Cloudinary-delivered (and therefore optimized) URL takes over.
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old)
          return null
        })
      } catch {
        setError(t.failed)
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old)
          return null
        })
      } finally {
        setBusy(false)
        if (inputRef.current) inputRef.current.value = ""
      }
    },
    [maxBytes, maxEdge, onUpload, t.failed, t.tooLarge, t.wrongType]
  )

  const handleRemove = React.useCallback(async () => {
    if (!onRemove) return
    setError(null)
    setBusy(true)
    try {
      await onRemove()
    } catch {
      setError(t.failed)
    } finally {
      setBusy(false)
    }
  }, [onRemove, t.failed])

  const openPicker = () => {
    if (!disabled && !busy) inputRef.current?.click()
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || busy}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && !busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (disabled || busy) return
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        className={cn(
          "relative flex cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 transition-colors",
          "hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          dragging && "border-primary bg-primary/5",
          (disabled || busy) && "cursor-not-allowed opacity-60"
        )}
      >
        {variant === "cover" ? (
          <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-muted">
            <CldImage
              src={shown}
              width={320}
              height={180}
              className="size-full"
              responsiveWidths={false}
              fallback={
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImagePlus className="size-6" />
                </div>
              }
            />
          </div>
        ) : (
          <EntityAvatar
            src={shown}
            name={name}
            size="xl"
            variant={variant === "logo" ? "logo" : "avatar"}
            className="shrink-0"
          />
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.uploading}
              </>
            ) : (
              <>
                <Upload className="size-4" />
                {shown ? t.replace : t.upload}
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{t.dropHint}</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {value && onRemove ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={handleRemove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {t.remove}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export { ImageUploadField }
