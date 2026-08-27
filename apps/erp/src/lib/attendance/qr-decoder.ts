export type DetectedBarcode = { rawValue: string };
export type QrDetector = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => QrDetector;

const MAX_EDGE = 640;

function nativeCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

export function cameraAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function sourceSize(source: CanvasImageSource): { w: number; h: number } {
  const v = source as HTMLVideoElement;
  if (typeof v.videoWidth === "number" && v.videoWidth > 0) {
    return { w: v.videoWidth, h: v.videoHeight };
  }
  const c = source as HTMLCanvasElement | HTMLImageElement;
  return { w: Number(c.width) || 0, h: Number(c.height) || 0 };
}

export function jsQrDetector(
  decode: typeof import("jsqr").default,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): QrDetector {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  return {
    async detect(source) {
      if (!ctx) return [];
      const { w, h } = sourceSize(source);
      if (!w || !h) return [];

      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
      }

      ctx.drawImage(source, 0, 0, dw, dh);
      const image = ctx.getImageData(0, 0, dw, dh);
      const found = decode(image.data, dw, dh, { inversionAttempts: "dontInvert" });
      return found?.data ? [{ rawValue: found.data }] : [];
    },
  };
}

export async function createQrDetector(): Promise<QrDetector | null> {
  if (!cameraAvailable()) return null;

  const Native = nativeCtor();
  if (Native) {
    try {
      return new Native({ formats: ["qr_code"] });
    } catch {
    }
  }

  const { default: decode } = await import("jsqr");
  return jsQrDetector(decode);
}
