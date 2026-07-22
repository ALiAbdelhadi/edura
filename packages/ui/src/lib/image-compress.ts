/**
 * Client-side downscale before upload.
 *
 * On the Egyptian mobile networks this app targets, a 4 MB phone photo is the
 * difference between a 200 ms upload and a 40 s one — and it is also what puts
 * a request over the 4.5 MB serverless body limit. Resizing in the browser
 * costs a few ms of canvas work and typically cuts a camera photo to 5-10% of
 * its original size before a single byte goes over the wire.
 *
 * Server-side validation still runs on the result (magic bytes + size), so a
 * client that skips this cannot smuggle anything through.
 */

export type CompressOptions = {
  /** Longest edge of the output, in pixels. */
  maxEdge?: number
  /** 0-1. Ignored for PNG (lossless). */
  quality?: number
  /** Output type. "auto" keeps PNG for PNG (transparency) and uses WebP otherwise. */
  outputType?: "auto" | "image/webp" | "image/jpeg" | "image/png"
  /** Files at or below this size skip re-encoding entirely. */
  skipBelowBytes?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdge: 1600,
  quality: 0.85,
  outputType: "auto",
  skipBelowBytes: 200 * 1024,
}

function canUseCanvas(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof createImageBitmap === "function"
  )
}

function outputTypeFor(file: File, requested: CompressOptions["outputType"]): string {
  if (requested && requested !== "auto") return requested
  // PNGs are usually logos/screenshots where transparency matters and WebP
  // re-encoding can look worse; everything else goes to WebP.
  if (file.type === "image/png") return "image/png"
  return "image/webp"
}

/**
 * Returns a downscaled File, or the ORIGINAL file whenever compression is
 * unavailable, unnecessary, or would make the file bigger. Never throws — a
 * failed compression must not block the upload.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const opts = { ...DEFAULTS, ...options }

  if (!file.type.startsWith("image/")) return file
  // Animated GIFs would lose their animation on a canvas round-trip.
  if (file.type === "image/gif") return file
  if (file.size <= opts.skipBelowBytes) return file
  if (!canUseCanvas()) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, opts.maxEdge / Math.max(width, height))

    // Already small enough AND already a modern format — nothing to gain.
    if (scale === 1 && (file.type === "image/webp" || file.type === "image/avif")) {
      bitmap.close()
      return file
    }

    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close()

    const type = outputTypeFor(file, opts.outputType)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, opts.quality)
    )
    if (!blob || blob.size >= file.size) return file

    const ext = type.split("/")[1] ?? "webp"
    const base = file.name.replace(/\.[^.]+$/, "") || "image"
    return new File([blob], `${base}.${ext}`, { type, lastModified: file.lastModified })
  } catch {
    return file
  }
}

/** Human-readable size, for upload UIs. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
