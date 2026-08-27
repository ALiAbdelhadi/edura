export type CompressOptions = {
  maxEdge?: number
  quality?: number
  outputType?: "auto" | "image/webp" | "image/jpeg" | "image/png"
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
  if (file.type === "image/png") return "image/png"
  return "image/webp"
}

export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const opts = { ...DEFAULTS, ...options }

  if (!file.type.startsWith("image/")) return file
  if (file.type === "image/gif") return file
  if (file.size <= opts.skipBelowBytes) return file
  if (!canUseCanvas()) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, opts.maxEdge / Math.max(width, height))

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
