"use client"

import * as React from "react"
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"
import { Button } from "@repo/ui/components/button"
import { CldImage, EntityAvatar } from "@repo/ui/components/cld-image"
import { compressImage, formatBytes } from "@repo/ui/lib/image-compress"

export const ACCEPTED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const
const ACCEPTED = ACCEPTED_IMAGE_MIMES.join(",")
export const UI_MAX_IMAGE_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_BYTES = UI_MAX_IMAGE_BYTES

export type ImageUploadFieldProps = {
  value?: string | null
  onUpload: (file: File) => Promise<void> | void
  onRemove?: () => Promise<void> | void
  variant?: "avatar" | "logo" | "cover"
  name?: string | null
  disabled?: boolean
  maxBytes?: number
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
  dropHint: "PNG, JPG or WebP — up to 4 MB",
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
  const [preview, setPreview] = React.useState<string | null>(null)

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const shown = preview ?? value ?? null

  const clearPreview = React.useCallback(() => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }, [])

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null)
      if (!file.type.startsWith("image/")) {
        setError(t.wrongType)
        return
      }
      if (file.size > maxBytes * 4) {
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
          clearPreview()
          return
        }
        await onUpload(compressed)
        clearPreview()
      } catch {
        setError(t.failed)
        clearPreview()
      } finally {
        setBusy(false)
        if (inputRef.current) inputRef.current.value = ""
      }
    },
    [clearPreview, maxBytes, maxEdge, onUpload, t.failed, t.tooLarge, t.wrongType]
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
